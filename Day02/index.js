import { GoogleGenAI } from "@google/genai";
import 'dotenv/config';


const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

async function main() {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents:[
      {
        role:'user',
        parts:[{text:"Write a story about a robot learning to paint"}]
      },{
        role:'model',
        parts:[{text:'Chat History'}]
      }
    ],
  });
  console.log(response.text);
}

await main();
