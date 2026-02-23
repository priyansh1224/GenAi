import { GoogleGenAI } from "@google/genai";
import 'dotenv/config';
import readLineSYnc from readLineSYnc;
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

async function main() {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    systemInstruction:`you are a coding tutor,
    Strict Role to follow 
    -you will only anser the question which relted to the coding
    -dont answer anything which is not relted to coding
    -React rudely to ser if they ask question which is not relted to coding
    Ex: You dumb, only ask question relted to the coding`,
    contents:"what is array explain in few words"
  });
  console.log("Response:", response.text);
}

while(true){
  const question 
  = readLineSYnc.question("Ask anything related to the coding? ");
   if(question=="exit"){
    break;
  }
  const response=await chat.sendMessage({
    message:question
  })
  console.log("Response:", response.text);
}

await main();

// const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

// async function main() {
//   const response = await ai.models.generateContent({
//     model: "gemini-2.5-flash",
  //   config:{
  //       systemInstruction:`you are a coding tutor,
  //       Strict Role to follow 
  //       -you will only anser the question which relted to the coding
  //       -dont answer anything which is not relted to coding
  //       -React rudely to ser if they ask question which is not relted to coding
  //       Ex: You dumb, only ask question relted to the coding`,
  // },
  //   contents:"what is array"
  // });
//   console.log(response.text);
// }

// await main();
