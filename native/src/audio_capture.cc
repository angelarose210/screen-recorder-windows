#include "audio_capture.h"
#include "util.h"

#include <functiondiscoverykeys_devpkey.h>
#include <avrt.h>

#pragma comment(lib, "ole32.lib")

AudioCapture::AudioCapture() {
    CoInitializeEx(nullptr, COINIT_MULTITHREADED);
}

AudioCapture::~AudioCapture() {
    stopLoopback();
    stopMicrophone();
}

void AudioCapture::writeWavHeader(HANDLE hFile, WAVEFORMATEX* format, DWORD dataSize) {
    DWORD written;
    DWORD fileSize = 36 + dataSize;

    WriteFile(hFile, "RIFF", 4, &written, nullptr);
    WriteFile(hFile, &fileSize, 4, &written, nullptr);
    WriteFile(hFile, "WAVE", 4, &written, nullptr);
    WriteFile(hFile, "fmt ", 4, &written, nullptr);

    DWORD fmtSize = 16;
    WORD audioFormat = WAVE_FORMAT_PCM;
    WORD bitsPerSample = 16;
    DWORD byteRate = format->nSamplesPerSec * format->nChannels * (bitsPerSample / 8);
    WORD blockAlign = format->nChannels * (bitsPerSample / 8);

    WriteFile(hFile, &fmtSize, 4, &written, nullptr);
    WriteFile(hFile, &audioFormat, 2, &written, nullptr);
    WriteFile(hFile, &format->nChannels, 2, &written, nullptr);
    WriteFile(hFile, &format->nSamplesPerSec, 4, &written, nullptr);
    WriteFile(hFile, &byteRate, 4, &written, nullptr);
    WriteFile(hFile, &blockAlign, 2, &written, nullptr);
    WriteFile(hFile, &bitsPerSample, 2, &written, nullptr);

    WriteFile(hFile, "data", 4, &written, nullptr);
    WriteFile(hFile, &dataSize, 4, &written, nullptr);
}

void AudioCapture::captureAudioLoop(const std::string& outputPath, bool isLoopback) {
    std::atomic<bool>& activeFlag = isLoopback ? m_loopbackActive : m_micActive;

    IMMDeviceEnumerator* enumerator = nullptr;
    IMMDevice* device = nullptr;
    IAudioClient* audioClient = nullptr;
    IAudioCaptureClient* captureClient = nullptr;

    HRESULT hr = CoCreateInstance(
        __uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
        __uuidof(IMMDeviceEnumerator), (void**)&enumerator
    );
    if (FAILED(hr)) { activeFlag = false; return; }

    hr = enumerator->GetDefaultAudioEndpoint(
        isLoopback ? eRender : eCapture,
        eConsole, &device
    );
    if (FAILED(hr)) { enumerator->Release(); activeFlag = false; return; }

    hr = device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, (void**)&audioClient);
    if (FAILED(hr)) { device->Release(); enumerator->Release(); activeFlag = false; return; }

    WAVEFORMATEX* mixFormat = nullptr;
    audioClient->GetMixFormat(&mixFormat);

    DWORD streamFlags = isLoopback ? AUDCLNT_STREAMFLAGS_LOOPBACK : 0;
    hr = audioClient->Initialize(
        AUDCLNT_SHAREMODE_SHARED, streamFlags,
        10000000, // 1 second buffer
        0, mixFormat, nullptr
    );
    if (FAILED(hr)) {
        CoTaskMemFree(mixFormat);
        audioClient->Release();
        device->Release();
        enumerator->Release();
        activeFlag = false;
        return;
    }

    hr = audioClient->GetService(__uuidof(IAudioCaptureClient), (void**)&captureClient);
    if (FAILED(hr)) {
        CoTaskMemFree(mixFormat);
        audioClient->Release();
        device->Release();
        enumerator->Release();
        activeFlag = false;
        return;
    }

    // Open output WAV file
    std::wstring wPath = utf8_to_wide(outputPath);
    HANDLE hFile = CreateFileW(
        wPath.c_str(), GENERIC_WRITE, 0, nullptr,
        CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr
    );
    if (hFile == INVALID_HANDLE_VALUE) {
        captureClient->Release();
        CoTaskMemFree(mixFormat);
        audioClient->Release();
        device->Release();
        enumerator->Release();
        activeFlag = false;
        return;
    }

    // Write placeholder WAV header (update size at end)
    writeWavHeader(hFile, mixFormat, 0);

    audioClient->Start();

    DWORD totalDataBytes = 0;
    const UINT32 blockBytes = mixFormat->nChannels * sizeof(int16_t);
    // WASAPI loopback delivers no packets while nothing is playing. Fill those gaps with
    // silence so the WAV stays as long as wall-clock time (otherwise audio is short/empty
    // and drifts out of sync).
    const ULONGLONG captureStartMs = GetTickCount64();
    UINT64 framesWritten = 0;
    auto padToNow = [&]() {
        UINT64 expected = (GetTickCount64() - captureStartMs) * mixFormat->nSamplesPerSec / 1000;
        if (expected <= framesWritten + mixFormat->nSamplesPerSec / 20) return; // <50ms behind: fine
        UINT64 gap = expected - framesWritten;
        std::vector<int16_t> silence((size_t)gap * mixFormat->nChannels, 0);
        DWORD written;
        WriteFile(hFile, silence.data(), (DWORD)(gap * blockBytes), &written, nullptr);
        totalDataBytes += (DWORD)(gap * blockBytes);
        framesWritten += gap;
    };
    bool isFloat = (mixFormat->wFormatTag == WAVE_FORMAT_IEEE_FLOAT) ||
        (mixFormat->wFormatTag == WAVE_FORMAT_EXTENSIBLE &&
         mixFormat->cbSize >= 22);

    while (activeFlag.load()) {
        Sleep(10); // ~100Hz polling

        UINT32 packetLength = 0;
        captureClient->GetNextPacketSize(&packetLength);

        while (packetLength > 0) {
            BYTE* data = nullptr;
            UINT32 numFrames = 0;
            DWORD flags = 0;

            hr = captureClient->GetBuffer(&data, &numFrames, &flags, nullptr, nullptr);
            if (FAILED(hr)) break;

            UINT32 bytesToWrite = numFrames * mixFormat->nChannels * sizeof(int16_t);

            if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
                // Write silence
                std::vector<int16_t> silence(numFrames * mixFormat->nChannels, 0);
                DWORD written;
                WriteFile(hFile, silence.data(), bytesToWrite, &written, nullptr);
            } else if (isFloat) {
                // Convert float32 to int16
                std::vector<int16_t> converted(numFrames * mixFormat->nChannels);
                float* floatData = (float*)data;
                for (UINT32 i = 0; i < numFrames * mixFormat->nChannels; i++) {
                    float sample = floatData[i];
                    if (sample > 1.0f) sample = 1.0f;
                    if (sample < -1.0f) sample = -1.0f;
                    converted[i] = (int16_t)(sample * 32767.0f);
                }
                DWORD written;
                WriteFile(hFile, converted.data(), bytesToWrite, &written, nullptr);
            } else {
                // Already PCM int16, write directly
                DWORD written;
                WriteFile(hFile, data, bytesToWrite, &written, nullptr);
            }

            totalDataBytes += bytesToWrite;
            framesWritten += numFrames;
            captureClient->ReleaseBuffer(numFrames);
            captureClient->GetNextPacketSize(&packetLength);
        }

        if (isLoopback && packetLength == 0) padToNow();
    }

    audioClient->Stop();
    if (isLoopback) padToNow();

    // Update WAV header with actual data size
    SetFilePointer(hFile, 0, nullptr, FILE_BEGIN);
    writeWavHeader(hFile, mixFormat, totalDataBytes);
    CloseHandle(hFile);

    captureClient->Release();
    CoTaskMemFree(mixFormat);
    audioClient->Release();
    device->Release();
    enumerator->Release();
}

bool AudioCapture::startLoopback(const std::string& outputPath) {
    if (m_loopbackActive.load()) return false;
    m_loopbackActive = true;
    m_loopbackThread = std::thread(&AudioCapture::captureAudioLoop, this, outputPath, true);
    return true;
}

bool AudioCapture::startMicrophone(const std::string& outputPath) {
    if (m_micActive.load()) return false;
    m_micActive = true;
    m_micThread = std::thread(&AudioCapture::captureAudioLoop, this, outputPath, false);
    return true;
}

void AudioCapture::stopLoopback() {
    m_loopbackActive = false;
    if (m_loopbackThread.joinable()) m_loopbackThread.join();
}

void AudioCapture::stopMicrophone() {
    m_micActive = false;
    if (m_micThread.joinable()) m_micThread.join();
}

// --- N-API Bindings ---

static AudioCapture g_audioCapture;

napi_value StartAudioCapture(napi_env env, napi_callback_info info) {
    size_t argc = 2;
    napi_value args[2];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

    // arg0: outputPath (string)
    char outputPath[512];
    size_t len;
    napi_get_value_string_utf8(env, args[0], outputPath, sizeof(outputPath), &len);

    // arg1: type ("loopback" or "mic")
    char type[32];
    napi_get_value_string_utf8(env, args[1], type, sizeof(type), &len);

    bool ok;
    if (std::string(type) == "loopback") {
        ok = g_audioCapture.startLoopback(std::string(outputPath));
    } else {
        ok = g_audioCapture.startMicrophone(std::string(outputPath));
    }

    napi_value result;
    napi_get_boolean(env, ok, &result);
    return result;
}

napi_value StopAudioCapture(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

    char type[32];
    size_t len;
    napi_get_value_string_utf8(env, args[0], type, sizeof(type), &len);

    if (std::string(type) == "loopback") {
        g_audioCapture.stopLoopback();
    } else {
        g_audioCapture.stopMicrophone();
    }

    napi_value undefined;
    napi_get_undefined(env, &undefined);
    return undefined;
}
