import { HNSWLib } from "langchain/vectorstores";
import { OpenAIEmbeddings } from "langchain/embeddings";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { Document } from "langchain/document";
import { BaseDocumentLoader } from "langchain/document_loaders";
import AdmZip from "adm-zip";
import { load } from "cheerio";

function processFile(filePath: string): Document {
  const xml = new AdmZip(filePath).readAsText("word/document.xml");

  const text = load(xml, { xml: true }).text();
  return new Document({ pageContent: text });
}

class DocxLoader extends BaseDocumentLoader {
  constructor(public filePath: string) {
    super();
  }
  async load(): Promise<Document[]> {
    return [processFile(this.filePath)];
  }
}

const documentPath = "CarbonAlmanac.docx";
const loader = new DocxLoader(documentPath);

export const run = async () => {
  const rawDocs = await loader.load();
  console.log("Loader created.");
  /* Split the text into chunks */
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });
  const docs = await textSplitter.splitDocuments(rawDocs);
  console.log("Docs splitted.");

  console.log("Creating vector store...");
  /* Create the vectorstore */
  const vectorStore = await HNSWLib.fromDocuments(docs, new OpenAIEmbeddings());
  await vectorStore.save("data");
};

(async () => {
  await run();
  console.log("done");
})();
