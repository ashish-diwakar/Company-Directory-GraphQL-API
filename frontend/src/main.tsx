import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { ApolloProvider } from '@apollo/client/react';
import { client } from './apollo-client';
import App from './App';
import './styles.css';
import './auth.css';
import './inventory.css';
import './linking.css';
import './history.css';
function Root() {
  const [session, setSession] = useState({ client, generation: 0 });
  useEffect(() => {
    const onChange = () => setSession(previous => ({ client, generation: previous.generation + 1 }));
    window.addEventListener('apollo-session-changed', onChange);
    return () => window.removeEventListener('apollo-session-changed', onChange);
  }, []);
  return <ApolloProvider client={session.client}><App key={session.generation}/></ApolloProvider>;
}
createRoot(document.getElementById('root')!).render(<Root/>);
