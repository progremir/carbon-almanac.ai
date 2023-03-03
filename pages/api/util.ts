import { OpenAI, OpenAIChat, BaseLLM } from "langchain/llms";
import { Document } from "langchain/document";
import { LLMChain, VectorDBQAChain, ChatVectorDBQAChain, ChainValues, StuffDocumentsChain } from "langchain/chains";
import { HNSWLib } from "langchain/vectorstores";
import { PromptTemplate } from "langchain/prompts";
import { LLMChainInput } from "langchain/dist/chains/llm_chain";

const CONDENSE_PROMPT = PromptTemplate.fromTemplate(`Given the following conversation and a follow up question, rephrase the follow up question to be a standalone question.

Chat History:
{chat_history}
Follow Up Input: {question}
Standalone question:`);

const SYSTEM_MESSAGE = PromptTemplate.fromTemplate(
  `You are an AI assistant for "The Carbon Almanac: It's not too late" book. The book can be bought at https://thecarbonalmanac.org.
It’s a source of reliable and easily understandable knowledge on climate change that people can share to create meaningful impact.
You are given the following extracted parts of the book. Provide a conversational answer.
If you don't know the answer, just tell them that you don't know. Don't try to make up an answer.
If the question is not about The Carbon Almanac's content, politely inform them that you are tuned to only answer questions about The Carbon Almanac's content.
=========
{context}
=========`);

const QA_PROMPT = PromptTemplate.fromTemplate(`{question}`);

// VectorDBQAChain is a chain that uses a vector store to find the most similar document to the question
// and then uses a documents chain to combine all the documents into a single string
// and then uses a LLMChain to generate the answer
// Before: Based on the chat history make singular question -> find related docs from the question -> combine docs and insert them as context -> generate answer
// After: Find related docs from the question -> combine docs and insert them into predefined system message -> pass in the chat history -> generate answer

export class OpenAIChatLLMChain extends LLMChain implements LLMChainInput {
  async _call(values: ChainValues): Promise<ChainValues> {
    let stop;
    if ("stop" in values && Array.isArray(values.stop)) {
      stop = values.stop;
    }
    const { chat_history } = values;
    const prefixMessages = chat_history.map((message: string[]) => {
      return [
        {
          role: "user",
          content: message[0]
        },
        {
          role: "assistant",
          content: message[1]
        }
      ]
    }).flat();

    const formattedSystemMessage = await SYSTEM_MESSAGE.format({ context: values.context })
    // @ts-ignore
    this.llm.prefixMessages = [
      {
        role: "system",
        content: formattedSystemMessage
      },
      {
        role: "assistant",
        content: "Hi, I'm an AI assistant for The Carbon Almanac. How can I help you?"
      },
      ...prefixMessages];
    const formattedString = await this.prompt.format(values);
    const llmResult = await this.llm.call(formattedString, stop);
    const result = { [this.outputKey]: llmResult };
    return result;
  }
}

class ChatStuffDocumentsChain extends StuffDocumentsChain {
  async _call(values: ChainValues): Promise<ChainValues> {
    if (!(this.inputKey in values)) {
      throw new Error(`Document key ${this.inputKey} not found.`);
    }
    const { [this.inputKey]: docs, ...rest } = values;
    const texts = (docs as Document[]).map(({ pageContent }) => pageContent);
    const text = texts.join("\n\n");
    const result = await this.llmChain.call({
      ...rest,
      [this.documentVariableName]: text,
    });
    return result;
  }
}

class OpenAIChatVectorDBQAChain extends VectorDBQAChain {
  async _call(values: ChainValues): Promise<ChainValues> {
    if (!(this.inputKey in values)) {
      throw new Error(`Question key ${this.inputKey} not found.`);
    }
    const question: string = values[this.inputKey];
    const docs = await this.vectorstore.similaritySearch(question, this.k);
    // all of this just to pass chat history to the LLMChain
    const inputs = { question, input_documents: docs, chat_history: values.chat_history };
    const result = await this.combineDocumentsChain.call(inputs);
    return result;
  }
}

interface qaParams {
  prompt?: PromptTemplate
}

// use this custom qa chain instead of the default one
const loadQAChain = (llm: BaseLLM, params: qaParams = {}) => {
  const { prompt = QA_PROMPT } = params;
  const llmChain = new OpenAIChatLLMChain({ prompt, llm });
  const chain = new ChatStuffDocumentsChain({ llmChain });
  return chain;
}


export const makeChain = (vectorstore: HNSWLib, onTokenStream?: (token: string) => void) => {
  const docChain = loadQAChain(
    new OpenAIChat({
      temperature: 0,
      streaming: Boolean(onTokenStream),
      callbackManager: {
        handleNewToken: onTokenStream,
      }
    }),
    { prompt: QA_PROMPT },
  );

  return new OpenAIChatVectorDBQAChain({
    vectorstore,
    combineDocumentsChain: docChain,
    inputKey: 'question',
  });
}