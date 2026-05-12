#pragma once

#include <node_api.h>
#include <string>
#include <vector>
#include <atomic>
#include <thread>
#include <mutex>
#include <windows.h>

struct CaptureSource {
    std::string id;
    std::string title;
    std::string type; // "monitor" or "window"
    int width;
    int height;
};

class ScreenCapture {
public:
    ScreenCapture();
    ~ScreenCapture();

    std::vector<CaptureSource> enumerateSources();
    bool startCapture(const std::string& sourceId, int fps, const std::string& pipeName);
    void stopCapture();
    bool isCapturing() const { return m_capturing.load(); }

private:
    std::atomic<bool> m_capturing{false};
    std::thread m_captureThread;
    std::string m_pipeName;
    int m_fps = 30;
    int m_width = 0;
    int m_height = 0;

    void captureLoop(const std::string& sourceId);

    static BOOL CALLBACK enumMonitorProc(HMONITOR hMonitor, HDC hdc, LPRECT rect, LPARAM param);
    static BOOL CALLBACK enumWindowProc(HWND hwnd, LPARAM param);
};

// N-API exports
napi_value EnumerateSources(napi_env env, napi_callback_info info);
napi_value StartCapture(napi_env env, napi_callback_info info);
napi_value StopCapture(napi_env env, napi_callback_info info);
napi_value GetCaptureState(napi_env env, napi_callback_info info);
