#pragma once

#include <chrono>
#include <string>

#define NAPI_CHECK(status, msg) \
    if ((status) != napi_ok) { \
        napi_throw_error(env, nullptr, msg); \
        return nullptr; \
    }

inline double get_timestamp_seconds() {
    static auto start = std::chrono::high_resolution_clock::now();
    auto now = std::chrono::high_resolution_clock::now();
    return std::chrono::duration<double>(now - start).count();
}

inline std::wstring utf8_to_wide(const std::string& str) {
    if (str.empty()) return L"";
    int size = MultiByteToWideChar(CP_UTF8, 0, str.c_str(), (int)str.size(), nullptr, 0);
    std::wstring result(size, 0);
    MultiByteToWideChar(CP_UTF8, 0, str.c_str(), (int)str.size(), result.data(), size);
    return result;
}

inline std::string wide_to_utf8(const std::wstring& str) {
    if (str.empty()) return "";
    int size = WideCharToMultiByte(CP_UTF8, 0, str.c_str(), (int)str.size(), nullptr, 0, nullptr, nullptr);
    std::string result(size, 0);
    WideCharToMultiByte(CP_UTF8, 0, str.c_str(), (int)str.size(), result.data(), size, nullptr, nullptr);
    return result;
}
