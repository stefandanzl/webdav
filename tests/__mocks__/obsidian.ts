// __mocks__/obsidian.ts
import { RequestUrlParam, RequestUrlResponse } from "obsidian";

// Translate Obsidian's RequestUrlParam to fetch RequestInit
async function requestUrl(params: RequestUrlParam | string): Promise<RequestUrlResponse> {
    let fetchOptions: RequestInit = {};
    if (typeof params === "string") {
        fetchOptions = {
            method: "GET",
        };
        params = { url: params };
    } else {
        fetchOptions = {
            method: params.method || "GET",
            headers: params.headers as HeadersInit,
            body: params.body,
        };
    }

    const response = await fetch(params.url, fetchOptions);

    // Convert fetch Response to Obsidian's RequestUrlResponse format
    // Clone response before reading it
    const responseForBuffer = response.clone();
    const responseForText = response.clone();

    const arrayBuffer = await responseForBuffer.arrayBuffer();
    const text = await responseForText.text();
    // Try to parse JSON, but if it fails, return null/undefined
    let jsonValue = null;
    try {
        jsonValue = JSON.parse(text);
    } catch {
        // Not JSON, leave as null
    }

    return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        arrayBuffer,
        text,
        json: jsonValue,
    };
}

export { requestUrl };

export class Notice {
    /**
     * @public
     */
    constructor(_message: string | DocumentFragment, _timeout?: number) {}

    /**
     * Change the message of this notice.
     * @public
     */
    setMessage(_message: string | DocumentFragment): this {
        return this;
    }

    /**
     * @public
     */
    hide(): void {}
}
