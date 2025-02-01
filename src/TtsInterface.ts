import { 
    TtsSyncResult,
    TtsStreamChunk,
    TtsGenParams,
    TTS_GEN_ERR,
    TtsStreamFormat
} from "./types.ts";

export interface TextToSpeech
{
    /**
     * Flag indicating the need for a full interruption of the TTS operations.
     */
    interruptNext: boolean;

    /**
     * Initializes the dependencies of the internal implementation of the TTS.
     * Should return only after all dependencies are fully loaded and the TTS is
     * ready to handle a request.
     */
    Init(loadRequest: Record<string, any>): Promise<TTS_GEN_ERR>;

    /**
     * Un-initializes the dependencies loaded during the call to Init.
     * The state should be left exactly as it was before the call to Init.
     * All memory, processes or operations should be stopped and cleaned up.
     */
    Free(): Promise<void>;

    /**
     * Sends a request to the TTS to generate audio.
     * Will wait until the full audio file is available before returning,
     * regardless of it the TTS supports streaming or not.
     * 
     * @param messages Array of messages forming the prompt
     * @param params Parameters for the TTS generation
     * @returns Struct containing an error code and a value (if error == SUCCESS)
     */
    Generate(input: string, params: TtsGenParams): Promise<TtsSyncResult>;

    /**
     * Sends a request to the TTS to generate stream of audio.
     * Will return the response data in a streaming manner as soon as it is
     * available via a callback function.
     * When the generation is finished, a new empty chunk will be sent with the
     * "done" flag set to true.
     * 
     * If the TTS does not support streaming, the callback will be called twice,
     * once for the full response and once for the "done" chunk.
     * 
     * @param messages Array of messages forming the prompt
     * @param params Parameters for the TTS generation
     * @param callback Callback function receiving the streamed chunks
     * @returns Error code for status of execution
     */
    GenerateStream(input: string,
                   params: TtsGenParams,
                   callback: (chunk: TtsStreamChunk) => any): Promise<TTS_GEN_ERR>;

    /**
     * Sends a request for interruption of the current generation(s)
     * Any operations currently done by the TTS module should be totally
     * stopped and reset to an idle state.
     * If the internal implementation of the TTS does not support interruption,
     * then the output (sync or streamed) should be cut off instead.
     */
    Interrupt(): Promise<void>;

    /**
     * Returns a list of model ids the user can use as a valid model_id field
     * in a generate request.
     */
    GetModels(): Promise<string[]>;

    /**
     * Returns info on the audio format when generating a TTS stream.
     */
    GetStreamFormat(): Promise<TtsStreamFormat>;
}

export function VerifyInterfaceAdherence(tts: any, ttsName: string): boolean
{
    if (tts.interruptNext == undefined)
    {
        console.error("[ERROR] Implementation of tts", ttsName, "failed to pass interface check.");
        console.error("[ERROR] Missing field interruptNext.");
        return false;
    }

    if (tts.Init == undefined)
    {
        console.error("[ERROR] Implementation of tts", ttsName, "failed to pass interface check.");
        console.error("[ERROR] Missing field Init.");
        return false;
    }

    if (tts.Free == undefined)
    {
        console.error("[ERROR] Implementation of tts", ttsName, "failed to pass interface check.");
        console.error("[ERROR] Missing field Free.");
        return false;
    }

    if (tts.Generate == undefined)
    {
        console.error("[ERROR] Implementation of tts", ttsName, "failed to pass interface check.");
        console.error("[ERROR] Missing field Generate.");
        return false;
    }

    if (tts.GenerateStream == undefined)
    {
        console.error("[ERROR] Implementation of tts", ttsName, "failed to pass interface check.");
        console.error("[ERROR] Missing field GenerateStream.");
        return false;
    }

    if (tts.Interrupt == undefined)
    {
        console.error("[ERROR] Implementation of tts", ttsName, "failed to pass interface check.");
        console.error("[ERROR] Missing field Interrupt.");
        return false;
    }

    if (tts.GetStreamFormat == undefined)
    {
        console.error("[ERROR] Implementation of tts", ttsName, "failed to pass interface check.");
        console.error("[ERROR] Missing field Interrupt.");
        return false;
    }

    return true;
}