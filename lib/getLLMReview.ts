import { GoogleGenAI } from "@google/genai";
import { PRinfo } from "./reviewer";
export async function getLLMReview(files: any[], prInfo: PRinfo) {

  const reviewPrompt = `You are an expert senior-level code reviewer. Review the following Pull Request in depth.

**Title**: ${prInfo.prTitle}
**Description**: ${prInfo.prBody || 'No description provided'}
**Author**: ${prInfo.prAuthor}

## Files Changed

${files.map(f => `
### File: \`${f.filename}\` (${f.status})
**Changes**: +${f.additions} / -${f.deletions}

**Diff**:
\`\`\`diff
${f.patch || 'No diff available'}
\`\`\`

**Full Content**:
\`\`\`
${f.fullContent}
\`\`\`
`).join('\n---\n')}

## What you must provide

1. **Summary (≤ 100 words)**  
   - Concisely describe what changed.  
   - Mention modifications to exported function signatures, public APIs, global variables, or anything affecting external behavior.

2. **Overall Assessment**  
   - Code quality, architecture, readability, maintainability.

3. **Issues Found**  
   - List problems with severity (\`critical\`, \`major\`, \`minor\`).  
   - Include file + line number.  
   - Be specific and actionable.

4. **Suggestions for Improvement**  
   - Better approaches, refactoring ideas, naming improvements, missing tests, etc.

## Response Format (JSON)

\`\`\`\`json
{
  "status": "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
  "summary": "≤ 100-word summary of changes",
  "issues": [
    {
      "severity": "critical" | "major" | "minor",
      "file": "filename",
      "line": 10,
      "issue": "description",
      "suggestion": "how to fix"
    }
  ],
  "improvements": [
    {
      "file": "filename",
      "line": 10,
      "suggestion": "better approach"
    }
  ]
}
\`\`\`\`

IMPORTANT: Respond with ONLY the JSON object. No explanations, no markdown, no preamble.`;

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY!
  });


  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: reviewPrompt,
    });

    console.log("llm review", response.text);

    const reviewText = response.text


    // clean the review text 
    const cleaned = reviewText?.replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    // parse the JSON

    const review = JSON.parse(cleaned!)
    return review
  } catch (e) {

    console.log("some error occured while doing llm call", e)
  }

}
