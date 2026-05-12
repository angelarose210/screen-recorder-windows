cmake_minimum_required(VERSION 3.15)

# Find Windows SDK rc.exe - node_modules/.bin/rc (npm package) shadows it
find_program(WIN_SDK_RC rc.exe PATHS
    "C:/Program Files (x86)/Windows Kits/10/bin/10.0.26100.0/x64"
    "C:/Program Files (x86)/Windows Kits/10/bin/10.0.22621.0/x64"
    "C:/Program Files (x86)/Windows Kits/10/bin/10.0.19041.0/x64"
    NO_DEFAULT_PATH
)
if(WIN_SDK_RC)
    set(CMAKE_RC_COMPILER "${WIN_SDK_RC}")
endif()

project(screen_recorder_native)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# cmake-js provides these variables
include_directories(${CMAKE_JS_INC})

add_library(${PROJECT_NAME} SHARED
    src/addon.cc
    src/screen_capture.cc
    src/audio_capture.cc
    src/cursor_tracker.cc
    ${CMAKE_JS_SRC}
)

set_target_properties(${PROJECT_NAME} PROPERTIES
    PREFIX ""
    SUFFIX ".node"
)

target_compile_options(${PROJECT_NAME} PRIVATE
    /EHsc
    /W3
    /bigobj
)

target_compile_definitions(${PROJECT_NAME} PRIVATE
    NAPI_VERSION=8
    NODE_GYP_MODULE_NAME=screen_recorder_native
    WINRT_LEAN_AND_MEAN
    WIN32_LEAN_AND_MEAN
    NOMINMAX
)

target_link_libraries(${PROJECT_NAME} PRIVATE
    ${CMAKE_JS_LIB}
    windowsapp.lib
    d3d11.lib
    dxgi.lib
    ole32.lib
    delayimp.lib
)
