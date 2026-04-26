import { agent } from 'confused-ai';

const myAgent = agent({
  model: 'gpt-4o-mini',                    // or 'claude-3-haiku', 'gemini-flash', ...
  instructions: 'You are a helpful assistant.',
});

const result = await myAgent.run('What is 12 * 8?');
console.log(result.text);          // "The answer is 96."
// Save the response as a .md file
// await fs.writeFile('answer.md', result.markdown.content);