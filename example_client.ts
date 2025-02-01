import * as readline from "readline/promises";
import { WebSocket } from "ws";

export enum TTS_GEN_ERR {
    SUCCESS = "SUCCESS",
    UNEXPECTED = "UNEXPECTED",
    AUTHORIZATION = "AUTHORIZATION",
    INVALID_PROVIDER = "INVALID_PROVIDER",
    INVALID_MODEL = "INVALID_MODEL",
    TIMEOUT = "TIMEOUT",
    INTERRUPT = "INTERRUPT",
};

let MessageInTypeList = [
    "load", 
    "generate", 
    "interrupt", 
    "close", 
    "get_providers", 
    "get_models",
    "get_stream_format",
    "clear_temp_files"
] as const;
type MessageInType = typeof MessageInTypeList[number];

let MessageOutTypeList = [
    "load_ack", 
    "generate_ack", 
    "interrupt_ack", 
    "close_ack", 
    "load_done", 
    "generate_done", 
    "generate_streamed", 
    "generate_stream_done", 
    "get_providers_done", 
    "get_models_done", 
    "get_stream_format_done",
    "clear_temp_files_ack"
] as const;
type MessageOutType = typeof MessageOutTypeList[number];

let TtsProviderList = ["fishaudio"] as const;
type TtsProviderListType = typeof TtsProviderList & string[];
type TtsProviderName = typeof TtsProviderList[number];

export type TtsStreamFormat = {
    bit_depth: number,
    frequency: number,
    channels_nb: number
}

export type TtsSyncResult = {
    path: string,
    audio_format: {
        format: "wav",
    } & TtsStreamFormat
};

type OutDataBase = {
    type: MessageOutType,
    unique_request_id: string,
}

type LoadDoneResponse = OutDataBase & {
    type: "load_done";
    provider: TtsProviderName
    is_error: boolean;
    error: TTS_GEN_ERR;
}

type GenerateDoneResponse = OutDataBase & {
    type: "generate_done"
    is_error: boolean;
    error: TTS_GEN_ERR;
    response: null | TtsSyncResult;
}

type StreamDoneResponse = OutDataBase & {
    type: "generate_stream_done"
    is_error: boolean;
    error: TTS_GEN_ERR;
}

type GetProvidersDoneResponse = OutDataBase & {
    type: "get_providers_done"
    providers: TtsProviderListType;
}

type GetModelsDoneResponse = OutDataBase & {
    type: "get_models_done"
    models: string[];
}

type GetStreamFormatDoneResponse = OutDataBase & {
    type: "get_stream_format_done"
    format: TtsStreamFormat;
}

type LoadAcknowledgement = OutDataBase & {
    type: "load_ack",
    provider: TtsProviderName
}

type GenerateAcknowledgement = OutDataBase & {
    type: "generate_ack"
}

type ClearTempFilesAcknowledgement = OutDataBase & {
    type: "clear_temp_files_ack"
}

type InterruptAcknowledgement = OutDataBase & {
    type: "interrupt_ack"
}

type CloseAcknowledgement = OutDataBase & {
    type: "close_ack"
}

type MessageTypeMap =  {
    load_ack: LoadAcknowledgement;
    generate_ack: GenerateAcknowledgement;
    interrupt_ack: InterruptAcknowledgement;
    close_ack: CloseAcknowledgement;
    load_done: LoadDoneResponse;
    generate_done: GenerateDoneResponse;
    generate_streamed: GenerateDoneResponse;
    generate_stream_done: StreamDoneResponse;
    get_providers_done: GetProvidersDoneResponse;
    get_models_done: GetModelsDoneResponse;
    get_stream_format_done: GetStreamFormatDoneResponse;
    clear_temp_files_ack: ClearTempFilesAcknowledgement;
}

type TaggedPromise<T> = {
    promise: Promise<T>,
    resolve: (arg0: T) => any,
    id: string
}

type TtsInput<T extends string> = T extends "" ? never : T;

type TtsGenParams = {
    model_id: string,
    voice_id: string,
    timeout_ms?: number | null | undefined,
    convert: null | undefined | {
        format: "wav",
        bit_depth: number,
        frequency: number,
        channels_nb: number,
        bit_rate: number
    },
}

const defaultGenParams: TtsGenParams = {
    model_id: "",
    voice_id: "",
    timeout_ms: 60_000,
    convert: null
}

type TtsProviderLoadParams = {
    api_key?: string;
    preload_model_id?: string;
}

class wAIfuTtsClient
{
    // Client socket connected to the module
    socket: WebSocket;

    // Collection of listeners for each message types
    // Allows us to await the reception of message data
    listeners: {
        [K in MessageOutType]: Record<string, TaggedPromise<MessageTypeMap[K]>>
    } = {
        load_ack: {},
        close_ack: {},
        interrupt_ack: {},
        generate_ack: {},
        load_done: {},
        generate_done: {},
        generate_stream_done: {},
        generate_streamed: {},
        get_models_done: {},
        get_providers_done: {},
        get_stream_format_done: {},
        clear_temp_files_ack: {}
    }

    // Promises are one-time use, so for the streaming we use a callback instead
    streamListeners: Record<string, (chunk: Buffer) => any> = {}

    constructor()
    {
        // Connect to module
        this.socket = new WebSocket("ws://127.0.0.1:7563");
        this.socket.onmessage = this.incomingHandler.bind(this);
    }

    async sendToModule(data: any)
    {
        await this.waitForConnected();
        this.socket.send(JSON.stringify(data));
    }

    async waitForConnected(): Promise<void>
    {
        if (this.socket.readyState == WebSocket.OPEN) return;

        const CONNECT_TIMEOUT = 5_000;
        let spent_time = 0;

        while (spent_time < CONNECT_TIMEOUT)
        {
            await new Promise(r => setTimeout(r, 100));
            spent_time += 100;
            // @ts-ignore
            if (this.socket.readyState == WebSocket.OPEN) return;
        }

        throw Error("Timeout during connection to TTS module.");
    }

    emit(messageType: string, id: string, data: any): void
    {
        let promise: TaggedPromise<OutDataBase> | undefined = this.listeners[messageType][id];
        
        if (promise != undefined)
        {
            promise.resolve(data);
            // Remove listener after resolve
            delete this.listeners[messageType][id];
        }
        else
        {
            console.error("[ERROR] Received unhandled message from server:", data);
            console.error("[ERROR] This might be due to an out-of-date client or module.");
        }
    }

    emitChunk(id: string, data: Buffer)
    {
        let callback = this.streamListeners[id];
        if (callback != undefined) callback(data);
    }

    incomingHandler(ev: WebSocket.MessageEvent): void
    {
        // is stream chunk
        if (ev.data instanceof Buffer)
        {
            let msgBuff: Buffer = ev.data as Buffer;
            let maybeHeader = msgBuff.subarray(0, 1).toString("utf8");
            
            if (maybeHeader != "$")
            {
                console.error("[ERROR] Received unhandled binary message.");
                return;
            }

            const idTerminator = "<|end_of_id|>";
            let termIdx = msgBuff.indexOf(idTerminator);
            let requestId = msgBuff.subarray(1, termIdx);
            let pcmData = msgBuff.subarray(termIdx + idTerminator.length);
            this.emitChunk(requestId.toString("utf8"), pcmData);
            return;
        }

        let message = JSON.parse(ev.data as string);
        let id = message.unique_request_id;
        this.emit(message.type, id, message);
    }

    listenTo<K extends MessageOutType, R = MessageTypeMap[K]>(messageType: K, id: string): Promise<R>
    {
        let resolver!: (arg0: R) => any;

        let promise = new Promise<R>(resolve => {
            resolver = resolve;
        });

        let taggedPromise = {
            id,
            resolve: resolver,
            promise
        };

        // @ts-ignore
        this.listeners[messageType][id] = taggedPromise;
        return taggedPromise.promise;
    }

    removeListener(messageType: string, id: string): void
    {
        if (this.listeners[messageType][id] != undefined)
        {
            delete this.listeners[messageType][id];
        }
    }

    removeAllListeners(id: string): void
    {
        for (let [messageType, _] of Object.entries(this.listeners))
        {
            if (this.listeners[messageType][id] != undefined)
            {
                delete this.listeners[messageType][id];
            }
        }

        if (this.streamListeners[id] != undefined)
        {
            delete this.streamListeners[id];
        }
    }

    listenToStream(id: string, callback: (chunk: Buffer) => any): void
    {
        this.streamListeners[id] = callback;
    }

    removeStreamListener(id: string): void
    {
        if (this.streamListeners[id] != undefined)
        {
            delete this.streamListeners[id];
        }
    }

    async loadProvider(providerName: TtsProviderName, params: TtsProviderLoadParams): Promise<void>
    {
        // Generate unique ID
        let id = crypto.randomUUID();

        // Create acknowledgement timeout and listeners
        let timeoutPromise = new Promise<undefined>(res => setTimeout(res, 1_000));
        let acknowledgementPromise = this.listenTo("load_ack", id);
        let donePromise = this.listenTo("load_done", id);

        // Send request to module
        await this.sendToModule({
            type: "load",
            unique_request_id: id,
            provider: providerName,
            api_key: params.api_key,
            preload_model_id: params.preload_model_id
        });

        // Race the promises (first to fulfill will return)
        let raceResult = await Promise.race([timeoutPromise, acknowledgementPromise]);

        // If timeout promise fulfilled first
        if (raceResult == undefined)
        {
            this.removeAllListeners(id);
            throw Error("loadProvider timed out, TTS module may be closed.");
        }

        // Wait for response of module
        let doneMessage = await donePromise;

        // Handle possible errors
        if (doneMessage.is_error)
        {
            throw Error("Failed to load provider. Error: " + doneMessage.error);
        }
        return;
    }

    async generate<T extends string>(input: TtsInput<T>, params: TtsGenParams): Promise<TtsSyncResult>
    {
        // Generate unique ID
        let id = crypto.randomUUID();

        // Create acknowledgement timeout and listeners
        let timeoutPromise = new Promise<undefined>(res => setTimeout(res, 1_000));
        let acknowledgementPromise = this.listenTo("generate_ack", id);
        let donePromise = this.listenTo("generate_done", id);

        let completeParams = {
            ...defaultGenParams,
            ...params,
        }

        // Send request to module
        await this.sendToModule({
            type: "generate",
            unique_request_id: id,
            input,
            params: completeParams,
            stream: false
        });

        // Race the promises (first to fulfill will return)
        let raceResult = await Promise.race([timeoutPromise, acknowledgementPromise]);

        // If timeout promise fulfilled first
        if (raceResult == undefined)
        {
            this.removeAllListeners(id);
            throw Error("generate timed out, TTS module may be closed.");
        }

        // Wait for response of module
        let doneMessage = await donePromise;

        // Handle possible errors
        if (doneMessage.is_error)
        {
            throw Error("Failed to generate response. Error: " + doneMessage.error);
        }
        
        let value = doneMessage.response!;
        return value;
    }

    async generateStream<T extends string>(input: TtsInput<T>, params: TtsGenParams, callback: (chunk: Buffer) => any): Promise<void>
    {
        // Generate unique ID
        let id = crypto.randomUUID();

        // Create acknowledgement timeout and listeners
        let timeoutPromise = new Promise<undefined>(res => setTimeout(res, 1_000));
        let acknowledgementPromise = this.listenTo("generate_ack", id);
        let donePromise = this.listenTo("generate_stream_done", id);
        this.listenToStream(id, callback);

        // Send request to module
        await this.sendToModule({
            type: "generate",
            unique_request_id: id,
            input,
            params,
            stream: true
        });

        // Race the promises (first to fulfill will return)
        let raceResult = await Promise.race([timeoutPromise, acknowledgementPromise]);

        // If timeout promise fulfilled first
        if (raceResult == undefined)
        {
            this.removeAllListeners(id);
            throw Error("generateStream timed out, TTS module may be closed.");
        }

        // Wait for final response of module (after end of stream)
        let doneMessage = await donePromise;
        this.removeStreamListener(id);

        // Handle possible errors
        if (doneMessage.is_error)
        {
            throw Error("Failed to stream response. Error: " + doneMessage.error);
        }
        return;
    }

    async interrupt(): Promise<void>
    {
        // Generate unique ID
        let id = crypto.randomUUID();

        // Create acknowledgement timeout and listeners
        let timeoutPromise = new Promise<undefined>(res => setTimeout(res, 1_000));
        let acknowledgementPromise = this.listenTo("interrupt_ack", id);

        // Send request to module
        await this.sendToModule({
            type: "interrupt",
            unique_request_id: id
        });

        // Race the promises (first to fulfill will return)
        let raceResult = await Promise.race([timeoutPromise, acknowledgementPromise]);

        // If timeout promise fulfilled first
        if (raceResult == undefined)
        {
            this.removeAllListeners(id);
            throw Error("interrupt timed out, LLM module may be closed.");
        }
    }

    async close(): Promise<void>
    {
        // Generate unique ID
        let id = crypto.randomUUID();

        // Create acknowledgement timeout and listeners
        let timeoutPromise = new Promise<undefined>(res => setTimeout(res, 1_000));
        let acknowledgementPromise = this.listenTo("close_ack", id);

        // Send request to module
        await this.sendToModule({
            type: "close",
            unique_request_id: id
        });

        // Race the promises (first to fulfill will return)
        await Promise.race([timeoutPromise, acknowledgementPromise]);
        // If timeout then module is likely already closed
    }

    async getProviders(): Promise<TtsProviderListType>
    {
        // Generate unique ID
        let id = crypto.randomUUID();

        // Create acknowledgement timeout and listeners
        let timeoutPromise = new Promise<undefined>(res => setTimeout(res, 1_000));
        let acknowledgementPromise = this.listenTo("get_providers_done", id);

        // Send request to module
        await this.sendToModule({
            type: "get_providers",
            unique_request_id: id
        });

        // Race the promises (first to fulfill will return)
        let raceResult = await Promise.race([timeoutPromise, acknowledgementPromise]);

        // If timeout promise fulfilled first
        if (raceResult == undefined)
        {
            this.removeAllListeners(id);
            throw Error("getProviders timed out, TTS module may be closed.");
        }

        return raceResult.providers;
    }

    async getModels(): Promise<string[]>
    {
        // Generate unique ID
        let id = crypto.randomUUID();

        // Create acknowledgement timeout and listeners
        let timeoutPromise = new Promise<undefined>(res => setTimeout(res, 1_000));
        let acknowledgementPromise = this.listenTo("get_models_done", id);

        // Send request to module
        await this.sendToModule({
            type: "get_models",
            unique_request_id: id
        });

        // Race the promises (first to fulfill will return)
        let raceResult = await Promise.race([timeoutPromise, acknowledgementPromise]);

        // If timeout promise fulfilled first
        if (raceResult == undefined)
        {
            this.removeAllListeners(id);
            throw Error("getModels timed out, TTS module may be closed.");
        }

        return raceResult.models;
    }

    async getStreamFormat(): Promise<TtsStreamFormat>
    {
        // Generate unique ID
        let id = crypto.randomUUID();

        // Create acknowledgement timeout and listeners
        let timeoutPromise = new Promise<undefined>(res => setTimeout(res, 1_000));
        let acknowledgementPromise = this.listenTo("get_stream_format_done", id);

        // Send request to module
        await this.sendToModule({
            type: "get_stream_format",
            unique_request_id: id
        });

        // Race the promises (first to fulfill will return)
        let raceResult = await Promise.race([timeoutPromise, acknowledgementPromise]);

        // If timeout promise fulfilled first
        if (raceResult == undefined)
        {
            this.removeAllListeners(id);
            throw Error("getStreamFormat timed out, TTS module may be closed.");
        }

        return raceResult.format;
    }

    async clearTempFiles(): Promise<void>
    {
        // Generate unique ID
        let id = crypto.randomUUID();

        // Create acknowledgement timeout and listeners
        let timeoutPromise = new Promise<undefined>(res => setTimeout(res, 1_000));
        let acknowledgementPromise = this.listenTo("clear_temp_files_ack", id);

        // Send request to module
        await this.sendToModule({
            type: "clear_temp_files",
            unique_request_id: id
        });

        // Race the promises (first to fulfill will return)
        let raceResult = await Promise.race([timeoutPromise, acknowledgementPromise]);
        
        // If timeout promise fulfilled first
        if (raceResult == undefined)
        {
            this.removeAllListeners(id);
            throw Error("interrupt timed out, LLM module may be closed.");
        }
    }
}

async function main(): Promise<void>
{
    let client = new wAIfuTtsClient();

    // Clear previous temporary audio files
    // Useful to not have disk space leaks
    await client.clearTempFiles();

    let providers = await client.getProviders();

    console.log("[LOG] Available providers:", providers);

    let stdinReader = readline.createInterface(process.stdin, process.stdout);
    let provider = (await stdinReader.question("[INPUT] Provider: ")) as TtsProviderName;
    let apiKey = await stdinReader.question("[INPUT] API Key: ");

    await client.loadProvider(provider, {
        api_key: apiKey
    });

    let models = await client.getModels();

    console.log("[LOG] Available models:", models);

    let model = await stdinReader.question("[INPUT] Model ID: ");

    console.log("[LOG] Generating: How are you feeling?");

    let response = await client.generate("How are you feeling?", {
        model_id: model,
        voice_id: "e58b0d7efca34eb38d5c4985e378abcb",
        timeout_ms: null,
        convert: null,
    });

    console.log("[LOG] Output at:", response.path);
    console.log("[LOG] Output format:", response.audio_format);

    console.log("[LOG] Generating stream: How are you feeling?");

    let streamPcmFormat = await client.getStreamFormat();
    console.log("[LOG] Stream PCM format:", streamPcmFormat);

    console.log("[LOG] Packets:");
    let packetNb = 0;

    await client.generateStream("How are you feeling?", {
        model_id: model,
        voice_id: "e58b0d7efca34eb38d5c4985e378abcb",
        timeout_ms: 15_000,
        convert: null,
    }, (chunk: Buffer) => {
        console.log("[LOG]", packetNb++, `(length: ${chunk.length})`, chunk.toString("hex").slice(0, 64), "...");
    });

    console.log("[LOG] Done.");
}

setImmediate(main);