import * as dotenv from 'dotenv';
// load the pdf
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeStore } from '@langchain/pinecone';


dotenv.config();
async function indexing() {
    try {
        const PDF_PATH = './node.pdf';
        const pdfLoader = new PDFLoader(PDF_PATH);
        const rawDocs = await pdfLoader.load();

        console.log('rawDocs loaded:', rawDocs.length);

        // chuncking create karna:

        const textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
        const chunkedDocs = await textSplitter.splitDocuments(rawDocs);

        console.log('chunkedDocs:', chunkedDocs.length);

        if (chunkedDocs.length === 0) {
            console.warn('No chunks were created; skipping embedding/upload. Check source PDF content.');
            return;
        }

        // embedding karni hai ab :

        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is required in .env');
        }

        const embeddings = new GoogleGenerativeAIEmbeddings({
            apiKey: process.env.GEMINI_API_KEY,
            model: process.env.GEMINI_EMBEDDING_MODEL ?? 'textembedding-gecko-001',
        });

        console.log('Embeddings provider initialized. Running embedding generation...');

        const allTexts = chunkedDocs.map((doc) => doc.pageContent);
        const allVectors = await embeddings.embedDocuments(allTexts);
        console.log('Received embeddings:', allVectors.length, 'vectors');
        console.log('First vector sample:', allVectors[0]);
        console.log('First vector length:', allVectors[0]?.length);
        console.log('All vector lengths (first 5):', allVectors.slice(0, 5).map((v) => v?.length));

        if (allVectors.some((v) => !Array.isArray(v) || v.length === 0)) {
            throw new Error('Embedding provider returned empty vectors for one or more inputs. Ensure GEMINI_API_KEY is correct and model is supported: set GEMINI_EMBEDDING_MODEL to a valid embedding model (e.g., textembedding-gecko-001).');
        }

        const validDocs = [];
        const validVectors = [];
        for (let i = 0; i < allVectors.length; i += 1) {
            const v = allVectors[i];
            if (Array.isArray(v) && v.length > 0) {
                validDocs.push(chunkedDocs[i]);
                validVectors.push(v);
            }
        }

        if (validDocs.length === 0) {
            console.warn('No valid embeddings returned from provider; skipping Pinecone upload.');
            return;
        }

        //   Step4:  Initialize Pinecone Client

        if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_ENVIRONMENT || !process.env.PINECONE_INDEX_NAME) {
            throw new Error('PINECONE_API_KEY, PINECONE_ENVIRONMENT, and PINECONE_INDEX_NAME must be set in .env');
        }

        const pinecone = new Pinecone();
        const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);

        // single step --> chunkDocs--> Embedding--> Vector DB
        const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
            pineconeIndex,
        });

        await vectorStore.addVectors(validVectors, validDocs);
        console.log('Pinecone upload complete:', validVectors.length, 'vectors');

    } catch (error) {
        console.error('indexing failed:', error);
    }
}

indexing();

// load the file into your system.
