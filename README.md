# w-AI-fu SDK TTS Module

## What is it
This is the TTS module of the modular w-AI-fu SDK.
It is a standalone module able to operate and communicate alongside any client applications via WebSocket.
  
The goal of this module is to integrate as many LLMs as possible into a single module.

## Principles
### Minimal Dependencies
A main principle of the module will be one of minimal dependencies.
Since there will be so many TTSs, there is a very high likelihood that downloading
every dependencies for every TTSs available would be time consuming and a considerable
waste of disk space.

In simpler words, you only install what you use.

### No Conflicts
Python venvs everywhere.

## Client Example
A client example is available in the example_client.ts file.

```typescript
// from example_client.ts
let client = new wAIfuTtsClient();

// Clear previous temporary audio files
// Useful to not have disk space leaks
await client.clearTempFiles();

let providers = await client.getProviders();

console.log("[LOG] Available providers:", providers);

await client.loadProvider(provider, {
    api_key: apiKey
});

// Get available models
let models = await client.getModels();

let response = await client.generate("How are you feeling?", {
    model_id: "", // no model id is needed for fishaudio (yet?)
    voice_id: "e58b0d7efca34eb38d5c4985e378abcb",
    timeout_ms: null,
    convert: null,
});

console.log("[LOG] Output at:", response.path);
console.log("[LOG] Output format:", response.audio_format);

// Get tts stream PCM format (bit depth, frequency, channels)
let streamPcmFormat = await client.getStreamFormat();

await client.generateStream("How are you feeling?", {
    model_id: model,
    voice_id: "e58b0d7efca34eb38d5c4985e378abcb",
    timeout_ms: 15_000,
    convert: null,
}, (chunk: Buffer) => {
    doSomethingWithPcmData(chunk);
});
```

## WebSocket API
### Input (from client application)
Input message types:
```js
["load", "generate", "interrupt", "close", "get_providers", "get_models"]
```

Load provider:
```js
{
    "type": "load",
    "unique_request_id": "<id unique to request>",
    "provider": "fishaudio",
    "api_key": "<api key>", // (optional, required by API tts),
    "preload_model_id": "<model id>" // (optional, useful for local tts)
}
```
Important: the load message may require a "api_key" field or other fields depending on the needs of the implementation.

load
1. load_ack
2. load_done

Generate:
```js
{
    "type": "generate",
    "unique_request_id": "<id unique to request>",
    "input": "<text to speak>",
    "params": {
        "model_id": "<model id>", // Get available models with get_models
        "voice_id": "<voice id>", // Voice id if required
        "timeout_ms": 10000, // or null
        // In stream mode, timeout is refreshed at every new chunk received
        "convert": null // Not implemented yet, enforces the output audio format for non-streamed generations using ffmpeg
    },
    "stream": false
}
```

generate (stream:false)
1. generate_ack
2. generate_done

generate (stream:true)
1. generate_ack
2. chunks as binary packets with format:
    1. '$' first byte/character
    2. Request ID as UTF8 string
    3. ID terminator "<|end_of_id|>"
    4. raw PCM data
    example: $MQZDXJsL7eyX5b8tZbccgQ==<|end_of_id|>0f21738d2d4243fcb08d6bb22c406cca
3. generate_stream_done

Interrupt:
```js
{
    "type": "interrupt",
    "unique_request_id": "<id unique to request>",
}
```

interrupt
1. interrupt_ack

Close module:
```js
{
    "type": "close",
    "unique_request_id": "<id unique to request>",
}
```

close
1. close_ack

Get available providers:
```js
{
    "type": "get_providers",
    "unique_request_id": "<id unique to request>",
}
```

get_providers
1. get_providers_done

Get available models from provider:
```js
{
    "type": "get_models",
    "unique_request_id": "<id unique to request>",
}
```
This can only be done after a provider has already been loaded.

get_models
1. get_models_done

Get PCM format of streamed chunk:
```js
{
    "type": "get_stream_format",
    "unique_request_id": "<id unique to request>",
}
```
This can only be done after a provider has already been loaded.

get_stream_format
1. get_stream_format_done

Clear temporary audio files:
```js
{
    "type": "clear_temp_files",
    "unique_request_id": "<id unique to request>",
}
```

clear_temp_files
1. clear_temp_files_ack

---
### Output (from LLM module)
Output message types:
```js
["load_ack", "generate_ack", "interrupt_ack", "close_ack", "load_done", "generate_done", "generate_streamed", "generate_stream_done", "generate_stream_chunk", "get_providers_done", "get_models_done"]
```

Provider load acknowledgment:
```js
{
    "type": "load_ack",
    "unique_request_id": "<id of initial request>",
    "provider": "fishaudio"
}
```

Provider load done:
```js
{
    "type": "load_done",
    "unique_request_id": "<id of initial request>",
    "provider": "fishaudio",
    "is_error": false,
    "error": "SUCCESS" // or "<error type>" if is_error is true
}
```

Generate acknowledgment:
```js
{
    "type": "generate_ack",
    "unique_request_id": "<id of initial request>"
}
```

Generate response:
```js
{
    "type": "generate_done",
    "unique_request_id": "<id of initial request>",
    "is_error": false,
    "error": "SUCCESS", // or "<error type>" if is_error is true
    "response": {
        "path": "<absolute path to audio file>",
        "audio_format": {
            "format": "wav",
            "bit_depth": 16,
            "frequency": 44100,
            "channels_nb": 1
        }
    } // or null if is_error is true
}
```

Generate stream chunk:
Stream chunks are not in the JSON format, instead they are in binary following this format:
1. '$' first byte/character
2. Request ID as UTF8 string
3. ID terminator "<|end_of_id|>"
4. raw PCM data
example: $MQZDXJsL7eyX5b8tZbccgQ==<|end_of_id|>0f21738d2d4243fcb08d6bb22c406cca

Generate stream done:
```js
{
    "type": "generate_stream_done",
    "unique_request_id": "<id of initial request>",
    "is_error": false,
    "error": "SUCCESS", // or "<error type>" if is_error is true
}
```

Interrupt acknowledgment:
```js
{
    "type": "interrupt_ack",
    "unique_request_id": "<id of initial request>",
}
```

Close acknowledgment:
```js
{
    "type": "close_ack",
    "unique_request_id": "<id of initial request>",
}
```

Clear temp files acknowledgment:
```js
{
    "type": "close_ack",
    "unique_request_id": "<id of initial request>",
}
```

Get providers done:
```js
{
    "type": "get_providers_done",
    "unique_request_id": "<id of initial request>",
    "providers": ["<list of providers>"]
}
```

Get models done:
```js
{
    "type": "get_models_done",
    "unique_request_id": "<id of initial request>",
    "providers": ["<list of model ids>"]
}
```

Get stream format done:
```js
{
    "type": "get_stream_format_done",
    "unique_request_id": "<id of initial request>",
    "format": {
        "bit_depth": 16,
        "frequency": 44100,
        "channels_nb": 1
    }
}
```
  
---
### Error types
```typescript
export enum TTS_GEN_ERR {
    SUCCESS = "SUCCESS",
    UNEXPECTED = "UNEXPECTED",
    AUTHORIZATION = "AUTHORIZATION",
    INVALID_PROVIDER = "INVALID_PROVIDER",
    INVALID_MODEL = "INVALID_MODEL",
    TIMEOUT = "TIMEOUT",
    INTERRUPT = "INTERRUPT",
};
```

## Requirements
NodeJS version >= v20.9.0 (v20.9.0 tested)  
Python 3.10 (if required by LLM implementation)

## TODO
- [x] FishAudio API implementation
- [ ] Elevenlabs API implementation
- [ ] Play.HT API implementation
- [ ] AllTalk local TTS implementation
- [ ] Eventual solution for multiple local models (hugging face, ollama)