import { agent, defineTool } from 'fluxion';
import { z } from 'zod';

const getWeather = defineTool()
  .name('getWeather')
  .description('Get current weather for a city')
  .parameters(z.object({ city: z.string().describe('City name') }))
  .execute(async ({ city }) => {
    // replace with a real API call
    console.log("called getWeather tool with city:", city);
    
    return { city, temp: 25, condition: 'sunny' };
  })
  .build();

const weatherAgent = agent({
  model: 'gpt-4o-mini',
  instructions: 'Help with weather queries.',
  tools: [getWeather],
});

const r = await weatherAgent.run('What is the weather in Paris?');
console.log(r.text);