import { GoogleGenAI, Type } from "@google/genai";
import dotenv from 'dotenv';
import util from 'util';
import fs from 'fs';
import path from "path";
import console from "console";


const ai=new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });



async function listFiles({directory}){
   const file=[];
   const extensions=['.js','.jsx','.ts','.tsx','.html','.css'];

   function scan(dir){
      const items = fs.readFileSync(dir);

      for(const items of items){
         const fullPath=path.join(dir,item);

         //skip node module,dist , build
         if(fullPath.includes('node_modules')||
            fullPath.includes('dist')||
            fullPath.includes('build')) continue;

         const stat=fs.statSync(fullPath);

         if(stat.isDirectory()){
            scan(fullPath);
         }else if(stat.isFile()){
            const ext=path.extname(item);
            if(extensions.includes(ext)){
               files.push(fillPath);
            }
         }
      }
   }

   scan(directory);
   console.log(`Found ${files.length} files`);
   return {files};
}

// npm glob use for the alternate path instead of using this function 


async function readFile({file_Path}){
   const content=fs.readFileSync(file_Path,'utf8');
   console.log(`Reading: ${file_Path}`);
   return content;
}
async function writeFile({file_Path,content}){
   fs.writeFileSync(file_Path,content,'utf8');
   console.log(`Fixed: ${file_Path}`);
   return {success:true};
}


const tools={
   list_files:listFiles,
   read_file:readFile,
   write_file:writeFile
   

}

// tool declarations

const listFilesTool={
   name:'list_files',
   description:"Get all javaScript files in a directory",
   parameters:{
      type:Type.OBJECT,
      properties:{
         directory:{
            type:Type.STRING,
            description:"Directory path to scan"
         }
      },
      required:['directory']
   }
}

const readFileTool={
   name:'read_file',
   description:"Read the content of a file",
   parameters:{
      type:Type.OBJECT,
      properties:{
         file_path:{
            type:Type.STRING,
            description:"Path of the file to read"
         }
      },
      required:['file_path']
   }
}

const writeFileTool={
   name:'write_file',
   description:"Write content to a file",
   parameters:{
      type:Type.OBJECT,
      properties:{
         file_path:{
            type:Type.STRING,
            description:"Path of the file to write"
         },
         content:{
            type:Type.STRING,
            description:"Content to write to the file"
         }
      },
      required:['file_path','content']
   }
};


//Main function 
export async function runAgent(directoryPath){
   console.log(`Reviewing: ${directoryPath}\n`);

   const History=[{
      role:"user",
      parts:[{
         text:`Review all javascript files in ${directoryPath} and fix any issues`
      }]
   }];
   while(true){
      const result=await ai.models.generateContent({
         model:"gemini-2.5-flash",
         contents:History,
         config:{
            systemInstruction:`You are an expert javaScript code reviewer and fixer.
            
            Your job:
            1.use list_files to get all HTML,css , JavaScript, and TypeScript files in the directory
            2.use read_file to read the content of each file and identify any issues or improvements
            3.Analyze for:
               **HTML Issues:**
               -Missing doctype, metaTags, semantic HTML
               -Broken links or images
               -Accessibility issues
               -Form validation problems
               -SEO issues
               -Inline styles that should be in css

               **CSS Issues:**
               -syntax errors, invalid properties
               -Browser compatibility issues
               -Insefficient selectors
               -Missing vendor prefixes
               -Deprecated properties
               -Poor selector specificity
               -Inefficient rules
               -Missing fallbacks

               **JavaScript Issues:**
               -Bugs:null/undefined errors, missing returns, type issues , async problems
               -security: hardcoded secrets, eval(),xss risks, injection vulnreablitites 
               -code Quality: console.logs, unused code, bad naming, complex logic
            
            4. Use write_file to fix the issues you found (write corrected code back )
            5.after fixing all files, respond with a summary report in TEXT format 

            **SUmmary Report Formate;**
            Code review Complete
            - Files reviewed: [count]
            - Issues fixed: [count]
            - Files modified: [count]
            - Summary of changes: [brief description]

            Total files Analyzed: x
            Files Fixed : Y

            security fixes:
            -file.js:line - Fixed Hardcoded API key
            -auth.js:line -Removed eval() usage

            Bug Fixes:
            -app.js:line-Added null check for user object
            -Index.html:line -added missing alt attribute

            Code quality improvements:
            -style.css: Replaced inline styles with classes
            -script.js: Removed console.log statements
            -utils.js: Improved function naming and documentation
             
            Be practical and focus on real issues. Actually Fix the code 
             
            `,
            tools:[{
               functionDeclarations:[listFilesTool,readFileTool,writeFileTool]

            }]
         }
      });

      // Process all Function calls at once
      if(result.functionCalls?.length>0){
         // execute all function calls
         for(const functionCall of result.functionCalls){
            const {name,args}=functionCall;

            console.log(`Executing: ${name} with args:`);
            const toolResponse=await tools[name](args);

            // add function call to history
            History.push({
               role:'model',
               parts:[{functionCall}]

            });

            // add function response to History
            History.push({
               role:'user',
               parts:[{functionResponse:{
                  name,
                  response:{result:toolResponse}
               }
            }]
            });
         }
      }else{
         console.log('\n'+ result.text);
         break;
      }
   }
}

// this is the meaning for that folder name that is the review
const directory=process.argv[2] || '.';

await runAgent(directory);



// to Run this code in the terminal command is "node index.js ../folder name(that need review) "
