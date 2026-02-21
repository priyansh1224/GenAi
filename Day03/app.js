import { GoogleGenAI } from "@google/genai";
import 'dotenv/config';
import readlineSync from 'readline-sync';

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

while(true){
  const question = readlineSync.question("Ask anything related to the coding? ");
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    systemInstruction:`you are a coding tutor,
    Strict Role to follow 
    -you will only anser the question which relted to the coding
    -dont answer anything which is not relted to coding
    -React rudely to ser if they ask question which is not relted to coding
    Ex: You dumb, only ask question relted to the coding`,
    contents: question
  });
  
  console.log("Response:", response.text);
}
