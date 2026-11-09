import React from 'react';import {createRoot} from 'react-dom/client';
function App(){const [rows,setRows]=React.useState([]);const [title,setTitle]=React.useState('');
const reload=()=>fetch('/api/tasks').then(r=>r.json()).then(setRows);
React.useEffect(()=>{reload().catch(console.error)},[]);
async function add(e){e.preventDefault();if(!title.trim())return;
 await fetch('/api/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title})});setTitle('');await reload();}
return <main style={{maxWidth:760,margin:'3rem auto',fontFamily:'system-ui'}}><h1>ATGV React + SQLite</h1>
<p>API: <a href="/api/docs">Swagger documentation</a> · <a href="/api/health">API health</a></p>
<form onSubmit={add}><input aria-label="New task" value={title} onChange={e=>setTitle(e.target.value)}/><button>Add task</button></form>
<ul>{rows.map(t=><li key={t.id}>{t.title} ({t.status})</li>)}</ul></main>}
createRoot(document.getElementById('root')).render(<App/>);
