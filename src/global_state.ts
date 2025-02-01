import { TextToSpeech } from "./TtsInterface";

export type GlobalState = {
    requirePath: string | undefined,
    loadedProviderName: string | undefined,
    textToSpeech: TextToSpeech | undefined,
}

export let state: GlobalState = {
    requirePath: undefined,
    loadedProviderName: undefined,
    textToSpeech: undefined,
}