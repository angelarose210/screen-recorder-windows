#include <node_api.h>
#include "screen_capture.h"
#include "audio_capture.h"
#include "cursor_tracker.h"

#define DECLARE_NAPI_METHOD(name, func) \
    { name, 0, func, 0, 0, 0, napi_default, 0 }

napi_value Init(napi_env env, napi_value exports) {
    napi_property_descriptor descriptors[] = {
        DECLARE_NAPI_METHOD("enumerateSources", EnumerateSources),
        DECLARE_NAPI_METHOD("startCapture", StartCapture),
        DECLARE_NAPI_METHOD("stopCapture", StopCapture),
        DECLARE_NAPI_METHOD("getCaptureState", GetCaptureState),
        DECLARE_NAPI_METHOD("startAudioCapture", StartAudioCapture),
        DECLARE_NAPI_METHOD("stopAudioCapture", StopAudioCapture),
        DECLARE_NAPI_METHOD("startCursorTracking", StartCursorTracking),
        DECLARE_NAPI_METHOD("stopCursorTracking", StopCursorTracking),
    };

    napi_define_properties(env, exports, sizeof(descriptors) / sizeof(descriptors[0]), descriptors);
    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
