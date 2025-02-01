import * as path from "path";
import * as fsSync from "fs";

import { TextToSpeech } from "../../src/TtsInterface";
import { TTS_GEN_ERR, TtsGenParams, TtsStreamChunk, TtsStreamFormat, TtsSyncResult } from "../../src/types";

import * as msgpack from "@msgpack/msgpack";

class TextToSpeechFishAudio implements TextToSpeech
{
    #apiKey: string | undefined = undefined;
    #concurrentGenerations: number = 0;

    interruptNext: boolean = false;

    async Init(loadRequest: Record<string, any>): Promise<TTS_GEN_ERR>
    {
        if (loadRequest["api_key"] == undefined)
        {
            console.error("[ERROR] Request to load fishaudio provider failed.");
            console.error("[ERROR] Request object is missing specific field \"api_key\"");
            console.error("[ERROR] Example:", {
                type: "load",
                provider: "fishaudio",
                api_key: "<api key>"
            });
            return TTS_GEN_ERR.AUTHORIZATION;
        }

        this.#apiKey = loadRequest["api_key"];

        try {
            var response = await fetch(`https://api.fish.audio/v1/tts`,
                {
                    method: "POST",
                    headers: {
                        "authorization": `Bearer ${this.#apiKey}`,
                        "content-type": "application/msgpack"
                    },
                    body: msgpack.encode({
                        text: "This is a test",
                        format: "wav",
                        reference_id: "e58b0d7efca34eb38d5c4985e378abcb",
                        normalize: false,
                        latency: "balanced"
                    })
                }
            );
        } catch (error) {
            console.error("[ERROR] Test request to fishaudio failed, assuming invalid API key.");
            console.error("[ERROR] Actual error:", error);
            return TTS_GEN_ERR.AUTHORIZATION;
        }

        if (response.status > 399)
        {
            console.error("[ERROR] Test request to fishaudio failed, assuming invalid API key.");
            console.error("[ERROR] Actual error:", response.status, await response.text());
            return TTS_GEN_ERR.AUTHORIZATION;
        }
        return TTS_GEN_ERR.SUCCESS;
    }

    async Free() {}

    async GetModels(): Promise<string[]>
    {
        return [];
    }

    async GetStreamFormat(): Promise<TtsStreamFormat>
    {
        return {
            bit_depth: 16,
            frequency: 44100,
            channels_nb: 1
        }
    }

    Generate(input: string, params: TtsGenParams): Promise<TtsSyncResult>
    {
        this.interruptNext = false;
        return new Promise(async resolve => {
            let finished: boolean = false;
            let timeout: NodeJS.Timeout | undefined = undefined;

            let abortController = new AbortController();

            if (params.timeout_ms)
            {
                setTimeout(() => {
                    if (finished) return;
                    finished = true;
                    abortController.abort();
                    
                    this.#concurrentGenerations -= 1;
                    if (this.#concurrentGenerations < 0) this.#concurrentGenerations = 0;

                    console.error("[ERROR] Generate timeout, request took longer than", params.timeout_ms, "ms.");
                    resolve({
                        error: TTS_GEN_ERR.TIMEOUT,
                        maybeValue: null,
                    });
                }, params.timeout_ms)
            }

            this.#concurrentGenerations += 1;

            try
            {
                var response = await fetch(`https://api.fish.audio/v1/tts`,
                    {
                        method: "POST",
                        signal: abortController.signal,
                        headers: {
                            "authorization": `Bearer ${this.#apiKey}`,
                            "content-type": "application/msgpack"
                        },
                        body: msgpack.encode({
                            text: input,
                            format: "wav",
                            reference_id: params.voice_id,
                            normalize: false,
                            latency: "balanced"
                        })
                    }
                );
            }
            catch (e)
            {
                if (finished) return;
                finished = true;

                this.#concurrentGenerations -= 1;
                if (this.#concurrentGenerations < 0) this.#concurrentGenerations = 0;

                console.error("[ERROR] Unexpected Generate error.");
                console.error("[ERROR] Error:", e);
                resolve({
                    error: TTS_GEN_ERR.UNEXPECTED,
                    maybeValue: null
                });
                return;
            }

            const audioId = crypto.randomUUID();
            const audioPath = path.join(process.cwd(), "audio", audioId + ".wav");

            const writeStream = fsSync.createWriteStream(audioPath);
            const reader = response.body!.getReader();
            
            while (true) {
                let data = await reader!.read();
                if (data.done || this.interruptNext || finished) break;
                writeStream.write(data.value);
            }
            writeStream.close();

            this.#concurrentGenerations -= 1;
            if (this.#concurrentGenerations < 0) this.#concurrentGenerations = 0;

            if (finished)
            {
                return;
            }

            finished = true;
            clearTimeout(timeout);

            if (this.interruptNext)
            {
                resolve({
                    error: TTS_GEN_ERR.INTERRUPT,
                    maybeValue: null,
                });
                return;
            }

            resolve({
                error: TTS_GEN_ERR.SUCCESS,
                maybeValue: {
                    path: audioPath,
                    audio_format: {
                        format: "wav",
                        bit_depth: 16,
                        frequency: 44_100,
                        channels_nb: 1,
                    }
                },
            });
            return;
        });
    }

    GenerateStream(input: string,
                   params: TtsGenParams,
                   callback: (chunk: TtsStreamChunk) => any): Promise<TTS_GEN_ERR>
    {
        this.interruptNext = false;
        return new Promise(async resolve => {
            let finished: boolean = false;
            let timeout: NodeJS.Timeout | undefined = undefined;

            let abortController: AbortController = new AbortController();

            if (params.timeout_ms)
            {
                timeout = setTimeout(() => {
                    if (finished) return;
                    finished = true;
                    abortController.abort();

                    this.#concurrentGenerations -= 1;
                    if (this.#concurrentGenerations < 0) this.#concurrentGenerations = 0;

                    console.error("[ERROR] GenerateStream timeout, request took longer than", params.timeout_ms, "ms.");
                    resolve(TTS_GEN_ERR.TIMEOUT);
                }, params.timeout_ms)
            }

            try {
                var response = await fetch(`https://api.fish.audio/v1/tts`,
                    {
                        method: "POST",
                        signal: abortController.signal,
                        headers: {
                            "authorization": `Bearer ${this.#apiKey}`,
                            "content-type": "application/msgpack"
                        },
                        body: msgpack.encode({
                            text: input,
                            format: "pcm",
                            reference_id: params.voice_id,
                            normalize: false,
                            latency: "balanced"
                        })
                    }
                );
            }
            catch(e)
            {
                if (finished) return;
                finished = true;

                this.#concurrentGenerations -= 1;
                if (this.#concurrentGenerations < 0) this.#concurrentGenerations = 0;

                console.error("[ERROR] Unexpected GenerateStream error.");
                console.error("[ERROR] Error:", e);
                resolve(TTS_GEN_ERR.UNEXPECTED);
                return;
            }

            const reader = response.body!.getReader();
            const CHUNK_SIZE = 2048;

            while (true)
            {
                let { value, done } = await reader.read();
                if (done || this.interruptNext || finished)
                {
                    abortController.abort();
                    break;
                };
    
                let buff = value!;
    
                while (buff.length)
                {
                    if (done || this.interruptNext || finished) break;

                    // refresh timeout
                    if (timeout)
                    {
                        timeout = timeout.refresh()
                    }

                    let chunkSize = Math.min(CHUNK_SIZE, buff.length);
                    let chunk = buff.subarray(0, chunkSize);
                    buff = buff.subarray(chunkSize);

                    await callback({
                        done: false,
                        chunk: Buffer.from(chunk),
                    });
                }
            }

            this.#concurrentGenerations -= 1;
            if (this.#concurrentGenerations < 0) this.#concurrentGenerations = 0;

            await callback({
                done: true,
                chunk: Buffer.from(""),
            });

            if (finished)
            {
                return;
            }
            
            finished = true;
            clearTimeout(timeout);

            if (this.interruptNext)
            {
                resolve(TTS_GEN_ERR.INTERRUPT);
                return;
            }

            resolve(TTS_GEN_ERR.SUCCESS);
            return;
        });
    }

    async Interrupt()
    {
        this.interruptNext = true;
    }
}

exports.Model = new TextToSpeechFishAudio();