import * as path from "path";
import * as fs from "fs/promises"

import { state } from "./global_state";
import { LoadTtsScript } from "./load_script";
import { TTS_GEN_ERR } from "./types";
import { TextToSpeech, VerifyInterfaceAdherence } from "./TtsInterface";



export async function LoadProvider(modelProvider: string, loadRequest: any): Promise<TTS_GEN_ERR>
{
    // Check if model exists
    const modelPath = path.join(process.cwd(), "providers", modelProvider);

    try
    {
        await fs.access(modelPath)
    }
    catch(e)
    {
        console.error("[ERROR] Failed to find provider:", modelProvider);
        return TTS_GEN_ERR.INVALID_PROVIDER;
    }

    let tempModel = await LoadTtsScript(modelPath, modelProvider);

    if (!tempModel)
    {
        console.error("[ERROR] Failed to load provider:", modelProvider);
        return TTS_GEN_ERR.UNEXPECTED;
    }

    if (tempModel.Model == undefined)
    {
        console.error("[ERROR] Index file of provider", modelProvider, "does not export a field \"Model\" adhering to the TextToSpeech interface.");
        return TTS_GEN_ERR.UNEXPECTED;
    }

    if (!VerifyInterfaceAdherence(tempModel.Model, modelProvider))
    {
        console.error("[ERROR] Loaded provider", modelProvider, "does not adhere to the TextToSpeech interface.");
        return TTS_GEN_ERR.UNEXPECTED;
    }

    if (state.textToSpeech != undefined)
    {
        await state.textToSpeech.Free();
        delete require.cache[state.requirePath ?? ""];
    }

    state.textToSpeech = tempModel.Model as TextToSpeech;
    return await state.textToSpeech.Init(loadRequest);
}