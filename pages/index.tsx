import { useState, useRef, useEffect, useMemo } from 'react'
import Head from 'next/head'
import styles from '../styles/Home.module.css'
import Image from 'next/image';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import CircularProgress from '@mui/material/CircularProgress';
import { fetchEventSource } from '@microsoft/fetch-event-source';

type Message = {
  type: "apiMessage" | "userMessage";
  message: string;
  isStreaming?: boolean;
}

export default function Home() {
  const [userInput, setUserInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messageState, setMessageState] = useState<{ messages: Message[], pending?: string, history: [string, string][] }>({
    messages: [{
      "message": "Hi, I'm an AI assistant for The Carbon Almanac. How can I help you?",
      "type": "apiMessage"
    }],
    history: []
  });
  const { messages, pending, history } = messageState;

  const messageListRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  // Auto scroll chat to bottom
  useEffect(() => {
    const messageList = messageListRef.current;
    if (messageList) {
      messageList.scrollTop = messageList.scrollHeight;
    }
  }, [pending]);

  // Focus on text field on load
  useEffect(() => {
    textAreaRef.current?.focus();
  }, []);

  // Handle form submission
  const handleSubmit = async (e: any) => {
    e.preventDefault();

    const question = userInput.trim();
    if (question === "") {
      return;
    }

    setMessageState(state => ({
      ...state,
      messages: [...state.messages, {
        type: "userMessage",
        message: question
      }],
      pending: undefined
    }));

    setLoading(true);
    setUserInput("");
    setMessageState(state => ({ ...state, pending: "" }));

    const ctrl = new AbortController();

    fetchEventSource('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question,
        history
      }),
      signal: ctrl.signal,
      onmessage: (event) => {
        if (event.data === "[DONE]") {
          setMessageState(state => ({
            history: [...state.history, [question, state.pending ?? ""]],
            messages: [...state.messages, {
              type: "apiMessage",
              message: state.pending ?? "",
            }],
            pending: undefined
          }));
          setLoading(false);
          ctrl.abort();
        } else {
          const data = JSON.parse(event.data);
          setMessageState(state => ({
            ...state,
            pending: (state.pending ?? "") + data.data,
          }));
        }
      }
    });
  }

  // Prevent blank submissions and allow for multiline input
  const handleEnter = (e: any) => {
    if (e.key === "Enter" && userInput) {
      if(!e.shiftKey && userInput) {
        handleSubmit(e);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
    }
  };

  const chatMessages = useMemo(() => {
    return [...messages, ...(pending ? [{ type: "apiMessage", message: pending }] : [])];
  }, [messages, pending]);

  return (
    <>
      <Head>
        {/* <!-- Primary Meta Tags --> */}
        <title>The Carbon Almanac - Chatbot</title>
        <meta name="title" content="The Carbon Almanac - Chatbot" />
        <meta name="description" content="Ask all the questions you have about climate change here!" />

        {/* <!-- Open Graph / Facebook --> */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="The Carbon Almanac - Chatbot" />
        <meta property="og:description" content="Ask all the questions you have about climate change here!" />
        <meta property="og:image" content="https://carbon.progremir.dev/og-image.svg" />

        {/* <!-- Twitter --> */}
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:title" content="The Carbon Almanac - Chatbot" />
        <meta property="twitter:description" content="Ask all the questions you have about climate change here!" />
        <meta property="twitter:image" content="https://carbon.progremir.dev/og-image.svg" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className={styles.topnav}>
        <div className = {styles.navlogo}>
          <Link href="/">The Carbon Almanac AI</Link>
        </div>
        <div className = {styles.navlinks}>
          <a
            href="https://thecarbonalmanac.org/"
            target="_blank"
            rel="noreferrer"
          >
            Book
          </a>
          <a
            href="https://github.com/progremir/carbon-almanac.ai"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </div>
      </div>
      <main className={styles.main}>
        <div className={styles.cloud}>
          <div ref={messageListRef} className={styles.messagelist}>
            {chatMessages.map((message, index) => {
              let icon;
              let className;

              if (message.type === "apiMessage") {
                icon = <Image src="/emoji.png" alt="AI" width="30" height="30" className={styles.boticon} priority />;
                className = styles.apimessage;
              } else {
                icon = <Image src="/usericon.png" alt="Me" width="30" height="30" className={styles.usericon} priority />

                // The latest message sent by the user will be animated while waiting for a response
                className = loading && index === chatMessages.length - 1
                  ? styles.usermessagewaiting
                  : styles.usermessage;
              }
              return (
                  <div key={index} className={className}>
                    {icon}
                    <div className = {styles.markdownanswer}>
                      <ReactMarkdown linkTarget="_blank">{message.message}</ReactMarkdown>
                    </div>
                  </div>
              )
            })}
          </div>
        </div>
        <div className={styles.center}>
          <div className={styles.cloudform}>
            <form onSubmit={handleSubmit}>
              <textarea 
                disabled={loading}
                onKeyDown={handleEnter}
                ref={textAreaRef}
                autoFocus={false}
                rows={1}
                maxLength={512}
                id="userInput" 
                name="userInput" 
                placeholder={loading? "Waiting for response..." : "Type your question..."}  
                value={userInput} 
                onChange={e => setUserInput(e.target.value)} 
                className={styles.textarea}
              />
              <button 
                type="submit" 
                disabled = {loading}
                className = {styles.generatebutton}
              >
                {loading ? (
                  <div className={styles.loadingwheel}>
                    <CircularProgress color="inherit" size={20}/>
                  </div>
                ) : (
                  // Send icon SVG in input field
                  <svg viewBox='0 0 20 20' className={styles.svgicon} xmlns='http://www.w3.org/2000/svg'>
                    <path d='M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z'></path>
                  </svg>
                )}
              </button>
            </form>
          </div>
          <div className = {styles.footer}>
            <p> Built by <a href="https://twitter.com/progremir" target="_blank" rel="noreferrer">
                Emir Amanbekov
              </a>. Not affiliated with <a href="https://thecarbonalmanac.org/" target="_blank" rel="noreferrer">
                The Carbon Almanac
              </a></p>
          </div>
          <a href="https://www.producthunt.com/posts/the-carbon-almanac-chatbot?utm_source=badge-featured&utm_medium=badge&utm_souce=badge-the&#0045;carbon&#0045;almanac&#0045;chatbot" target="_blank"><img style={{ width: "250px", height: "54px" }} src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=382264&theme=neutral" alt="The&#0032;Carbon&#0032;Almanac&#0058;&#0032;Chatbot - Answers&#0032;climate&#0032;change&#0032;related&#0032;questions | Product Hunt" /></a>
        </div>
      </main>
    </>
  )
}
