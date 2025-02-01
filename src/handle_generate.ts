import WebSocket from "ws";
import { IncomingMessage } from "./receive_handler";
import { TTS_GEN_ERR, TtsGenParams, TtsStreamChunk } from "./types";
import { state } from "./global_state";
import { sendToClient } from "./typed_send";

type GenerateMessage = {
    type: "generate",
    unique_request_id: string,
    input: string,
    params: TtsGenParams,
    stream: boolean
}

const exampleGenMessage: GenerateMessage = {
    type: "generate",
    unique_request_id: crypto.randomUUID(),
    input: "This is a test message.",
    params: {
        model_id: "",
        voice_id: "<voice id>",
        timeout_ms: null,
        convert: {
            format: "wav",
            bit_depth: 16,
            frequency: 48_000,
            channels_nb: 1,
            bit_rate: 192_000
        }
    },
    stream: false
}

function RequiredFieldError(fieldName: string)
{
    console.error(`[ERROR] Incoming generate message does not have the required field [\"${fieldName}\"].`);
    console.error("[ERROR] Example:", exampleGenMessage);
    console.error("[ERROR] Refer to the README file for more information about generate messages.");
}

export async function HandleGenerateRequest(socket: WebSocket, message: IncomingMessage): Promise<void>
{
    if (state.textToSpeech == undefined)
    {
        console.error(`[ERROR] Failed to generate, no model is currently loaded.`);
        return;
    }

    const requiredFields = [
        "unique_request_id",
        "input",
        "params",
        "stream"
    ];

    for (let requField of requiredFields)
    {
        if (message[requField] === undefined)
        {
            RequiredFieldError(requField);
            return;
        }
    }

    let paramsObj = message["params"];

    const requiredParams = [
        "model_id",
        "voice_id",
        "timeout_ms"
    ];

    for (let requParam of requiredParams)
    {
        if (paramsObj[requParam] === undefined)
        {
            RequiredFieldError(`params"]["${requParam}`);
            return;
        }
    }

    let generateMessage = message as GenerateMessage;

    if (generateMessage.input.length == 0)
    {
        console.error(`[ERROR] Field \"messages\" in incoming generate message must be of length >0.`);
        console.error("[ERROR] Example:", exampleGenMessage);
        console.error("[ERROR] Refer to the README file for more information about generate messages.");
        return;
    }

    // Acknowledge generate request
    sendToClient(socket, "generate_ack", {
        type: "generate_ack",
        unique_request_id: generateMessage.unique_request_id
    });

    if (generateMessage.stream)
    {
        const responseError = await state.textToSpeech.GenerateStream(
            generateMessage.input,
            generateMessage.params,
            (chunk: TtsStreamChunk) => {
                if (chunk.done) return;

                let idBuff = Buffer.from("$" + generateMessage.unique_request_id + "<|end_of_id|>");
                let pcmBuff = chunk.chunk;
                socket.send(Buffer.concat([idBuff, pcmBuff]));
            }
        );

        let isError = responseError != TTS_GEN_ERR.SUCCESS;
        if (isError)
        {
            console.error("[ERROR] Error during streamed generation.");
            console.error("[ERROR] Error type:", responseError);
        }

        sendToClient(socket, "generate_stream_done",{
            type: "generate_stream_done",
            unique_request_id: generateMessage.unique_request_id,
            is_error: isError,
            error: responseError
        });
    }
    else
    {
        const response = await state.textToSpeech.Generate(
            generateMessage.input,
            generateMessage.params
        );

        let isError = response.error != TTS_GEN_ERR.SUCCESS;
        if (isError)
        {
            console.error("[ERROR] Error during generation.");
            console.error("[ERROR] Error type:", response.error);
        }

        sendToClient(socket, "generate_done",{
            type: "generate_done",
            unique_request_id: generateMessage.unique_request_id,
            is_error: isError,
            error: response.error,
            response: response.maybeValue
        });
    }
}