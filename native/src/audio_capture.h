#pragma once

#include <node_api.h>
#include <string>
#include <atomic>
#include <thread>
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>

class AudioCapture {
public:
    AudioCapture();
    ~AudioCapture();

    bool startLoopback(const std::string& outputPath);
    bool startMicrophone(const std::string& outputPath);
    void stopLoopback();
    void stopMicrophone();
    bool isLoopbackActive() const { return m_loopbackActive.load(); }
    bool isMicActive() const { return m_micActive.load(); }

private:
    std::atomic<bool> m_loopbackActive{false};
    std::atomic<bool> m_micActive{false};
    std::thread m_loopbackThread;
    std::thread m_micThread;

    void captureAudioLoop(const std::string& outputPath, bool isLoopback);
    void writeWavHeader(HANDLE hFile, WAVEFORMATEX* format, DWORD dataSize);
};

// N-API exports
napi_value StartAudioCapture(napi_env env, napi_callback_info info);
napi_value StopAudioCapture(napi_env env, napi_callback_info info);
