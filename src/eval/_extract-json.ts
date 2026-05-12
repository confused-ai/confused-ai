/**
 * Vendored extractJson helper for eval package.
 */
export function extractJson(text: string): unknown {
    let jsonStr = text.trim();

    // Try markdown code block first
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1]!.trim();
    }

    // Try to find JSON object or array
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
        jsonStr = jsonMatch[0]!;
    }

    try {
        return JSON.parse(jsonStr);
    } catch (error) {
        throw new Error(`Failed to parse JSON from response: ${error instanceof Error ? error.message : String(error)}`);
    }
}
