#pragma once

#include <node_api.h>
#include <string>
#include <vector>
#include <atomic>
#include <thread>
#include <mutex>
#include <windows.h>

struct CursorEvent {
    double t;           // seconds since tracking start
    int x;
    int y;
    std::string event;  // "move", "click", "scroll"
    std::string button; // "left", "right", "middle" (for clicks)
    int delta = 0;      // scroll delta
    int screen_w;
    int screen_h;
};

class CursorTracker {
public:
    CursorTracker();
    ~CursorTracker();

    void start(int fps = 60);
    std::vector<CursorEvent> stop();
    bool isTracking() const { return m_tracking.load(); }

private:
    std::atomic<bool> m_tracking{false};
    std::thread m_trackThread;
    std::mutex m_eventsMutex;
    std::vector<CursorEvent> m_events;
    int m_fps = 60;

    void trackLoop();
};

// N-API exports
napi_value StartCursorTracking(napi_env env, napi_callback_info info);
napi_value StopCursorTracking(napi_env env, napi_callback_info info);
