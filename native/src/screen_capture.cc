#include "screen_capture.h"
#include "util.h"

#include <algorithm>
#include <vector>
#include <cstring>

#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Graphics.Capture.h>
#include <winrt/Windows.Graphics.DirectX.h>
#include <winrt/Windows.Graphics.DirectX.Direct3D11.h>
#include <windows.graphics.capture.interop.h>
#include <windows.graphics.capture.h>
#include <d3d11.h>
#include <dxgi1_2.h>
#include <inspectable.h>

// IDirect3DDxgiInterfaceAccess - COM interface for getting DXGI interface from WinRT Direct3D objects
MIDL_INTERFACE("A9B3D012-3DF2-4EE3-B8D1-8695F457D3C1")
IDirect3DDxgiInterfaceAccess : public IUnknown {
    virtual HRESULT STDMETHODCALLTYPE GetInterface(REFIID iid, void** p) = 0;
};

#pragma comment(lib, "d3d11.lib")
#pragma comment(lib, "dxgi.lib")

using namespace winrt;
using namespace winrt::Windows::Graphics::Capture;
using namespace winrt::Windows::Graphics::DirectX;
using namespace winrt::Windows::Graphics::DirectX::Direct3D11;

// Helper: create a Direct3D11 device
static ID3D11Device* createD3DDevice() {
    ID3D11Device* device = nullptr;
    D3D_FEATURE_LEVEL featureLevel;
    HRESULT hr = D3D11CreateDevice(
        nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr,
        D3D11_CREATE_DEVICE_BGRA_SUPPORT,
        nullptr, 0, D3D11_SDK_VERSION,
        &device, &featureLevel, nullptr
    );
    if (FAILED(hr)) return nullptr;
    return device;
}

// Helper: get WinRT Direct3DDevice from D3D11 device
static IDirect3DDevice getWinRTDevice(ID3D11Device* d3dDevice) {
    IDXGIDevice* dxgiDevice = nullptr;
    d3dDevice->QueryInterface(__uuidof(IDXGIDevice), (void**)&dxgiDevice);

    IInspectable* inspectable = nullptr;
    typedef HRESULT(__stdcall* CreateDirect3D11DeviceFromDXGIDeviceFunc)(IDXGIDevice*, IInspectable**);

    HMODULE d3d11Module = GetModuleHandleW(L"d3d11.dll");
    auto createFunc = (CreateDirect3D11DeviceFromDXGIDeviceFunc)GetProcAddress(
        d3d11Module, "CreateDirect3D11DeviceFromDXGIDevice"
    );

    if (createFunc) {
        createFunc(dxgiDevice, &inspectable);
    }

    IDirect3DDevice device{nullptr};
    if (inspectable) {
        inspectable->QueryInterface(guid_of<IDirect3DDevice>(), winrt::put_abi(device));
        inspectable->Release();
    }
    if (dxgiDevice) dxgiDevice->Release();
    return device;
}

ScreenCapture::ScreenCapture() {}

// Writes one whole frame to the pipe, looping over partial writes
static bool writeFrame(HANDLE hPipe, const std::vector<BYTE>& buf) {
    const BYTE* p = buf.data();
    size_t left = buf.size();
    while (left > 0) {
        DWORD chunk = (DWORD)(std::min)(left, (size_t)(1 << 24));
        DWORD written = 0;
        if (!WriteFile(hPipe, p, chunk, &written, nullptr) || written == 0) return false;
        p += written;
        left -= written;
    }
    return true;
}

ScreenCapture::~ScreenCapture() {
    stopCapture();
}

BOOL CALLBACK ScreenCapture::enumMonitorProc(HMONITOR hMonitor, HDC, LPRECT rect, LPARAM param) {
    auto* sources = reinterpret_cast<std::vector<CaptureSource>*>(param);

    MONITORINFOEXW info{};
    info.cbSize = sizeof(info);
    GetMonitorInfoW(hMonitor, &info);

    CaptureSource src;
    src.id = "monitor:" + std::to_string(reinterpret_cast<uintptr_t>(hMonitor));
    src.title = wide_to_utf8(info.szDevice);
    if (info.dwFlags & MONITORINFOF_PRIMARY) {
        src.title += " (Primary)";
    }
    src.type = "monitor";
    src.x = rect->left;
    src.y = rect->top;
    src.width = rect->right - rect->left;
    src.height = rect->bottom - rect->top;
    sources->push_back(src);
    return TRUE;
}

BOOL CALLBACK ScreenCapture::enumWindowProc(HWND hwnd, LPARAM param) {
    auto* sources = reinterpret_cast<std::vector<CaptureSource>*>(param);

    if (!IsWindowVisible(hwnd)) return TRUE;

    wchar_t title[256];
    int len = GetWindowTextW(hwnd, title, 256);
    if (len == 0) return TRUE;

    // Skip certain system windows
    DWORD style = GetWindowLong(hwnd, GWL_EXSTYLE);
    if (style & WS_EX_TOOLWINDOW) return TRUE;

    RECT rect;
    GetWindowRect(hwnd, &rect);
    int w = rect.right - rect.left;
    int h = rect.bottom - rect.top;
    if (w < 100 || h < 100) return TRUE;

    CaptureSource src;
    src.id = "window:" + std::to_string(reinterpret_cast<uintptr_t>(hwnd));
    src.title = wide_to_utf8(std::wstring(title, len));
    src.type = "window";
    src.width = w;
    src.height = h;
    sources->push_back(src);
    return TRUE;
}

std::vector<CaptureSource> ScreenCapture::enumerateSources() {
    std::vector<CaptureSource> sources;
    EnumDisplayMonitors(nullptr, nullptr, enumMonitorProc, reinterpret_cast<LPARAM>(&sources));
    EnumWindows(enumWindowProc, reinterpret_cast<LPARAM>(&sources));
    return sources;
}

bool ScreenCapture::startCapture(const std::string& sourceId, int fps, const std::string& pipeName,
                                 int cropX, int cropY, int cropW, int cropH) {
    if (m_capturing.load()) return false;

    m_cropX = cropX;
    m_cropY = cropY;
    m_cropW = cropW;
    m_cropH = cropH;

    m_fps = fps;
    m_pipeName = pipeName;
    m_outW = 0;
    m_outH = 0;
    m_capturing = true;

    m_captureThread = std::thread(&ScreenCapture::captureLoop, this, sourceId);
    return true;
}

void ScreenCapture::stopCapture() {
    m_capturing = false;
    if (m_captureThread.joinable()) {
        m_captureThread.join();
    }
}

void ScreenCapture::captureLoop(const std::string& sourceId) {
    winrt::init_apartment(winrt::apartment_type::multi_threaded);

    // Parse source ID
    bool isMonitor = sourceId.find("monitor:") == 0;
    uintptr_t handle = std::stoull(sourceId.substr(sourceId.find(':') + 1));

    // Create D3D device
    ID3D11Device* d3dDevice = createD3DDevice();
    if (!d3dDevice) {
        m_capturing = false;
        return;
    }

    ID3D11DeviceContext* d3dContext = nullptr;
    d3dDevice->GetImmediateContext(&d3dContext);

    IDirect3DDevice winrtDevice = getWinRTDevice(d3dDevice);
    if (!winrtDevice) {
        d3dDevice->Release();
        m_capturing = false;
        return;
    }

    // Create capture item via interop
    GraphicsCaptureItem captureItem{nullptr};
    auto interopFactory = winrt::get_activation_factory<GraphicsCaptureItem, IGraphicsCaptureItemInterop>();

    HRESULT hr;
    if (isMonitor) {
        hr = interopFactory->CreateForMonitor(
            reinterpret_cast<HMONITOR>(handle),
            guid_of<GraphicsCaptureItem>(),
            winrt::put_abi(captureItem)
        );
    } else {
        hr = interopFactory->CreateForWindow(
            reinterpret_cast<HWND>(handle),
            guid_of<GraphicsCaptureItem>(),
            winrt::put_abi(captureItem)
        );
    }

    if (FAILED(hr) || !captureItem) {
        d3dContext->Release();
        d3dDevice->Release();
        m_capturing = false;
        return;
    }

    // The encoder needs one fixed frame size for the whole recording. Lock it to the
    // item's size at start (even dims for yuv420p); later frames are cropped/padded to it.
    auto size = captureItem.Size();
    int originX = 0, originY = 0;
    if (m_cropW > 0 && m_cropH > 0) {
        // Region recording: clamp the rect to the source, output only that area
        originX = (std::max)(0, (std::min)(m_cropX, size.Width - 2));
        originY = (std::max)(0, (std::min)(m_cropY, size.Height - 2));
        m_width = (std::min)(m_cropW, size.Width - originX) & ~1;
        m_height = (std::min)(m_cropH, size.Height - originY) & ~1;
    } else {
        m_width = size.Width & ~1;
        m_height = size.Height & ~1;
    }
    m_outW = m_width;
    m_outH = m_height;
    auto poolSize = size;

    // Create frame pool
    auto framePool = Direct3D11CaptureFramePool::CreateFreeThreaded(
        winrtDevice,
        DirectXPixelFormat::B8G8R8A8UIntNormalized,
        2, // buffer count
        size
    );

    auto session = framePool.CreateCaptureSession(captureItem);
    session.IsCursorCaptureEnabled(false);

    // Create named pipe server for writing frames to FFmpeg
    std::wstring wPipeName = utf8_to_wide(m_pipeName);
    HANDLE hPipe = CreateNamedPipeW(
        wPipeName.c_str(),
        PIPE_ACCESS_OUTBOUND,
        PIPE_TYPE_BYTE | PIPE_WAIT,
        1,                          // max instances
        m_width * m_height * 4 * 2, // output buffer size (2 frames)
        0,                          // input buffer size
        0,                          // default timeout
        nullptr                     // security attributes
    );

    if (hPipe == INVALID_HANDLE_VALUE) {
        session.Close();
        framePool.Close();
        d3dContext->Release();
        d3dDevice->Release();
        m_capturing = false;
        return;
    }

    // Wait for FFmpeg to connect to the pipe (blocks until client connects)
    if (!ConnectNamedPipe(hPipe, nullptr)) {
        DWORD err = GetLastError();
        if (err != ERROR_PIPE_CONNECTED) {
            CloseHandle(hPipe);
            session.Close();
            framePool.Close();
            d3dContext->Release();
            d3dDevice->Release();
            m_capturing = false;
            return;
        }
    }

    // Create staging texture for CPU readback
    D3D11_TEXTURE2D_DESC stagingDesc{};
    stagingDesc.Width = m_width;
    stagingDesc.Height = m_height;
    stagingDesc.MipLevels = 1;
    stagingDesc.ArraySize = 1;
    stagingDesc.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
    stagingDesc.SampleDesc.Count = 1;
    stagingDesc.Usage = D3D11_USAGE_STAGING;
    stagingDesc.CPUAccessFlags = D3D11_CPU_ACCESS_READ;

    ID3D11Texture2D* stagingTexture = nullptr;
    d3dDevice->CreateTexture2D(&stagingDesc, nullptr, &stagingTexture);

    // Last full frame (starts black). Windows only delivers frames when content changes,
    // so it is re-sent on idle ticks to keep a constant frame rate in sync with audio.
    const size_t outRowBytes = (size_t)m_width * 4;
    std::vector<BYTE> frameBuf(outRowBytes * m_height, 0);

    session.StartCapture();

    auto frameInterval = std::chrono::microseconds(1000000 / m_fps);
    auto nextFrameTime = std::chrono::high_resolution_clock::now();

    while (m_capturing.load()) {
        auto now = std::chrono::high_resolution_clock::now();
        if (now < nextFrameTime) {
            std::this_thread::sleep_until(nextFrameTime);
        }
        nextFrameTime += frameInterval;

        auto frame = framePool.TryGetNextFrame();
        if (!frame) {
            if (!writeFrame(hPipe, frameBuf)) m_capturing = false;
            continue;
        }

        // Window was resized: grow/shrink the pool so the next frames match the content
        auto contentSize = frame.ContentSize();
        if (contentSize.Width != poolSize.Width || contentSize.Height != poolSize.Height) {
            poolSize = contentSize;
            framePool.Recreate(winrtDevice, DirectXPixelFormat::B8G8R8A8UIntNormalized, 2, poolSize);
        }

        auto surface = frame.Surface();

        // Get the underlying D3D11 texture via COM QueryInterface
        ID3D11Texture2D* frameTexture = nullptr;
        {
            IDirect3DDxgiInterfaceAccess* dxgiAccess = nullptr;
            hr = winrt::get_unknown(surface)->QueryInterface(
                __uuidof(IDirect3DDxgiInterfaceAccess), (void**)&dxgiAccess);
            if (SUCCEEDED(hr) && dxgiAccess) {
                hr = dxgiAccess->GetInterface(IID_PPV_ARGS(&frameTexture));
                dxgiAccess->Release();
            }
        }
        if (SUCCEEDED(hr) && frameTexture) {
            // Frame textures can differ from the output size (window resize, DWM borders).
            // Copy the overlapping region and pad the rest with black so every frame
            // written to the pipe is exactly m_width x m_height.
            D3D11_TEXTURE2D_DESC srcDesc{};
            frameTexture->GetDesc(&srcDesc);
            int availW = (std::min)((int)srcDesc.Width, (int)contentSize.Width) - originX;
            int availH = (std::min)((int)srcDesc.Height, (int)contentSize.Height) - originY;
            int copyW = (std::max)(0, (std::min)(availW, m_width));
            int copyH = (std::max)(0, (std::min)(availH, m_height));

            D3D11_BOX box{ (UINT)originX, (UINT)originY, 0, (UINT)(originX + copyW), (UINT)(originY + copyH), 1 };
            if (copyW > 0 && copyH > 0)
                d3dContext->CopySubresourceRegion(stagingTexture, 0, 0, 0, 0, frameTexture, 0, &box);

            D3D11_MAPPED_SUBRESOURCE mapped{};
            hr = d3dContext->Map(stagingTexture, 0, D3D11_MAP_READ, 0, &mapped);
            if (SUCCEEDED(hr)) {
                BYTE* src = (BYTE*)mapped.pData;
                for (int row = 0; row < m_height; row++) {
                    BYTE* out = frameBuf.data() + row * outRowBytes;
                    if (row < copyH) {
                        memcpy(out, src + row * mapped.RowPitch, copyW * 4);
                        if (copyW < m_width) memset(out + copyW * 4, 0, (m_width - copyW) * 4);
                    } else {
                        memset(out, 0, outRowBytes);
                    }
                }
                d3dContext->Unmap(stagingTexture, 0);
            }
            frameTexture->Release();
        }
        frame.Close();
        if (!writeFrame(hPipe, frameBuf)) m_capturing = false;
    }

    session.Close();
    framePool.Close();
    CloseHandle(hPipe);
    if (stagingTexture) stagingTexture->Release();
    d3dContext->Release();
    d3dDevice->Release();
}

// --- N-API Bindings ---

static ScreenCapture g_screenCapture;

napi_value EnumerateSources(napi_env env, napi_callback_info) {
    auto sources = g_screenCapture.enumerateSources();

    napi_value result;
    napi_create_array_with_length(env, sources.size(), &result);

    for (size_t i = 0; i < sources.size(); i++) {
        napi_value obj;
        napi_create_object(env, &obj);

        napi_value val;
        napi_create_string_utf8(env, sources[i].id.c_str(), NAPI_AUTO_LENGTH, &val);
        napi_set_named_property(env, obj, "id", val);

        napi_create_string_utf8(env, sources[i].title.c_str(), NAPI_AUTO_LENGTH, &val);
        napi_set_named_property(env, obj, "title", val);

        napi_create_string_utf8(env, sources[i].type.c_str(), NAPI_AUTO_LENGTH, &val);
        napi_set_named_property(env, obj, "type", val);

        napi_create_int32(env, sources[i].x, &val);
        napi_set_named_property(env, obj, "x", val);

        napi_create_int32(env, sources[i].y, &val);
        napi_set_named_property(env, obj, "y", val);

        napi_create_int32(env, sources[i].width, &val);
        napi_set_named_property(env, obj, "width", val);

        napi_create_int32(env, sources[i].height, &val);
        napi_set_named_property(env, obj, "height", val);

        napi_set_element(env, result, (uint32_t)i, obj);
    }

    return result;
}

napi_value StartCapture(napi_env env, napi_callback_info info) {
    size_t argc = 4;
    napi_value args[4];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

    // arg0: sourceId (string)
    char sourceId[256];
    size_t len;
    napi_get_value_string_utf8(env, args[0], sourceId, sizeof(sourceId), &len);

    // arg1: fps (number)
    int32_t fps;
    napi_get_value_int32(env, args[1], &fps);

    // arg2: pipeName (string)
    char pipeName[512];
    napi_get_value_string_utf8(env, args[2], pipeName, sizeof(pipeName), &len);

    // arg3 (optional): crop rect { x, y, width, height } in source pixels
    int32_t crop[4] = { 0, 0, 0, 0 };
    napi_valuetype t = napi_undefined;
    if (argc >= 4) napi_typeof(env, args[3], &t);
    if (t == napi_object) {
        const char* keys[4] = { "x", "y", "width", "height" };
        for (int i = 0; i < 4; i++) {
            napi_value v;
            if (napi_get_named_property(env, args[3], keys[i], &v) == napi_ok)
                napi_get_value_int32(env, v, &crop[i]);
        }
    }

    bool ok = g_screenCapture.startCapture(std::string(sourceId), fps, std::string(pipeName),
                                           crop[0], crop[1], crop[2], crop[3]);

    napi_value result;
    napi_get_boolean(env, ok, &result);
    return result;
}

napi_value StopCapture(napi_env env, napi_callback_info) {
    g_screenCapture.stopCapture();
    napi_value undefined;
    napi_get_undefined(env, &undefined);
    return undefined;
}

napi_value GetCaptureSize(napi_env env, napi_callback_info) {
    napi_value obj, w, h;
    napi_create_object(env, &obj);
    napi_create_int32(env, g_screenCapture.outWidth(), &w);
    napi_create_int32(env, g_screenCapture.outHeight(), &h);
    napi_set_named_property(env, obj, "width", w);
    napi_set_named_property(env, obj, "height", h);
    return obj;
}

napi_value GetCaptureState(napi_env env, napi_callback_info) {
    const char* state = g_screenCapture.isCapturing() ? "capturing" : "idle";
    napi_value result;
    napi_create_string_utf8(env, state, NAPI_AUTO_LENGTH, &result);
    return result;
}
