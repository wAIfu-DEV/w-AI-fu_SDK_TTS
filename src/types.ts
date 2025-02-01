export enum TTS_GEN_ERR {
    SUCCESS = "SUCCESS",
    UNEXPECTED = "UNEXPECTED",
    AUTHORIZATION = "AUTHORIZATION",
    INVALID_PROVIDER = "INVALID_PROVIDER",
    INVALID_MODEL = "INVALID_MODEL",
    TIMEOUT = "TIMEOUT",
    INTERRUPT = "INTERRUPT",
};

export type TtsStreamFormat = {
    bit_depth: number,
    frequency: number,
    channels_nb: number
}

export type TtsSyncResultVal = {
    path: string,
    audio_format: {
        format: "wav",
    } & TtsStreamFormat
}

export type TtsSyncResult = {
    error: TTS_GEN_ERR,
    maybeValue: null | TtsSyncResultVal,
};

export type TtsStreamChunk = {
    done: boolean,
    chunk: Buffer
};

export type TtsGenParams = {
    model_id: string,
    voice_id: string,
    timeout_ms: number | null,
    convert: null | {
        format: "wav",
        bit_depth: number,
        frequency: number,
        channels_nb: number,
        bit_rate: number
    },
}

type MessageInType = "load"
                     | "generate"
                     | "interrupt"
                     | "close"
                     | "get_providers"
                     | "get_models";

export type MessageOutType = "load_ack"
                      | "generate_ack"
                      | "interrupt_ack"
                      | "close_ack"
                      | "load_done"
                      | "generate_done"
                      | "generate_streamed"
                      | "generate_stream_done"
                      | "get_providers_done"
                      | "get_models_done"
                      | "get_stream_format_done"
                      | "clear_temp_files_ack"

export let TtsProviderList = ["fishaudio"] as const;
export type TtsProviderName = typeof TtsProviderList[number];

export type OutDataBase = {
    type: MessageOutType,
    unique_request_id: string,
}

export type LoadDoneResponse = OutDataBase & {
    type: "load_done";
    provider: TtsProviderName
    is_error: boolean;
    error: TTS_GEN_ERR;
}

export type GenerateDoneResponse = OutDataBase & {
    type: "generate_done"
    is_error: boolean;
    error: TTS_GEN_ERR;
    response: TtsSyncResultVal | null;
}

export type StreamDoneResponse = OutDataBase & {
    type: "generate_stream_done"
    is_error: boolean;
    error: TTS_GEN_ERR;
}

export type GetProvidersDoneResponse = OutDataBase & {
    type: "get_providers_done"
    providers: typeof TtsProviderList;
}

export type GetModelsDoneResponse = OutDataBase & {
    type: "get_models_done"
    models: string[];
}

export type GetStreamFormatDoneResponse = OutDataBase & {
    type: "get_stream_format_done"
    format: TtsStreamFormat;
}

export type LoadAcknowledgement = OutDataBase & {
    type: "load_ack",
    provider: TtsProviderName
}

export type GenerateAcknowledgement = OutDataBase & {
    type: "generate_ack"
}

export type InterruptAcknowledgement = OutDataBase & {
    type: "interrupt_ack"
}

export type CloseAcknowledgement = OutDataBase & {
    type: "close_ack"
}

export type ClearTempFilesAcknowledgement = OutDataBase & {
    type: "clear_temp_files_ack"
}

export type MessageTypeMap =  {
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

export type StrictMessageData<K extends MessageOutType> = MessageTypeMap[K] & { type: K };