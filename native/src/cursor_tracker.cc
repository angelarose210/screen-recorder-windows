#include "cursor_tracker.h"
#include "util.h"

#include <chrono>

CursorTracker::CursorTracker() {}

CursorTracker::~CursorTracker() {
    if (m_tracking.load()) {
        stop();
    }
}

void CursorTracker::start(int fps) {
    if (m_tracking.load()) return;
    m_fps = fps;
    m_tracking = true;

    std::lock_guard<std::mutex> lock(m_eventsMutex);
    m_events.clear();

    m_trackThread = std::thread(&CursorTracker::trackLoop, this);
}

std::vector<CursorEvent> CursorTracker::stop() {
    m_tracking = false;
    if (m_trackThread.joinable()) {
        m_trackThread.join();
    }

    std::lock_guard<std::mutex> lock(m_eventsMutex);
    return std::move(m_events);
}

void CursorTracker::trackLoop() {
    auto startTime = std::chrono::high_resolution_clock::now();
    auto interval = std::chrono::microseconds(1000000 / m_fps);

    POINT lastPos{-1, -1};
    bool lastLButton = false;
    bool lastRButton = false;
    bool lastMButton = false;

    while (m_tracking.load()) {
        auto frameStart = std::chrono::high_resolution_clock::now();
        double t = std::chrono::duration<double>(frameStart - startTime).count();

        POINT pos;
        GetCursorPos(&pos);

        // Get screen dimensions
        int screenW = GetSystemMetrics(SM_CXSCREEN);
        int screenH = GetSystemMetrics(SM_CYSCREEN);

        bool lButton = (GetAsyncKeyState(VK_LBUTTON) & 0x8000) != 0;
        bool rButton = (GetAsyncKeyState(VK_RBUTTON) & 0x8000) != 0;
        bool mButton = (GetAsyncKeyState(VK_MBUTTON) & 0x8000) != 0;

        std::lock_guard<std::mutex> lock(m_eventsMutex);

        // Detect clicks (button down transitions)
        if (lButton && !lastLButton) {
            m_events.push_back({t, pos.x, pos.y, "click", "left", 0, screenW, screenH});
        } else if (rButton && !lastRButton) {
            m_events.push_back({t, pos.x, pos.y, "click", "right", 0, screenW, screenH});
        } else if (mButton && !lastMButton) {
            m_events.push_back({t, pos.x, pos.y, "click", "middle", 0, screenW, screenH});
        } else if (pos.x != lastPos.x || pos.y != lastPos.y) {
            // Only log move events when position actually changed
            m_events.push_back({t, pos.x, pos.y, "move", "", 0, screenW, screenH});
        }

        lastPos = pos;
        lastLButton = lButton;
        lastRButton = rButton;
        lastMButton = mButton;

        // Sleep until next frame
        auto elapsed = std::chrono::high_resolution_clock::now() - frameStart;
        auto sleepTime = interval - elapsed;
        if (sleepTime.count() > 0) {
            std::this_thread::sleep_for(sleepTime);
        }
    }
}

// --- N-API Bindings ---

static CursorTracker g_cursorTracker;

napi_value StartCursorTracking(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

    int32_t fps = 60;
    if (argc > 0) {
        napi_get_value_int32(env, args[0], &fps);
    }

    g_cursorTracker.start(fps);

    napi_value undefined;
    napi_get_undefined(env, &undefined);
    return undefined;
}

napi_value StopCursorTracking(napi_env env, napi_callback_info) {
    auto events = g_cursorTracker.stop();

    napi_value result;
    napi_create_array_with_length(env, events.size(), &result);

    for (size_t i = 0; i < events.size(); i++) {
        napi_value obj;
        napi_create_object(env, &obj);

        napi_value val;
        napi_create_double(env, events[i].t, &val);
        napi_set_named_property(env, obj, "t", val);

        napi_create_int32(env, events[i].x, &val);
        napi_set_named_property(env, obj, "x", val);

        napi_create_int32(env, events[i].y, &val);
        napi_set_named_property(env, obj, "y", val);

        napi_create_string_utf8(env, events[i].event.c_str(), NAPI_AUTO_LENGTH, &val);
        napi_set_named_property(env, obj, "event", val);

        if (!events[i].button.empty()) {
            napi_create_string_utf8(env, events[i].button.c_str(), NAPI_AUTO_LENGTH, &val);
            napi_set_named_property(env, obj, "button", val);
        }

        if (events[i].delta != 0) {
            napi_create_int32(env, events[i].delta, &val);
            napi_set_named_property(env, obj, "delta", val);
        }

        napi_create_int32(env, events[i].screen_w, &val);
        napi_set_named_property(env, obj, "screen_w", val);

        napi_create_int32(env, events[i].screen_h, &val);
        napi_set_named_property(env, obj, "screen_h", val);

        napi_set_element(env, result, (uint32_t)i, obj);
    }

    return result;
}
