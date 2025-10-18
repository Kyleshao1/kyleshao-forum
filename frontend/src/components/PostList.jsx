import { useEffect, useState } from 'react';
import api from '../api';
import { Link } from 'react-router-dom';
export default function PostList(){
  const [posts,setPosts]=useState([]);
  useEffect(()=>{ api.get('/post').then(r=>setPosts(r.data)); },[]);
  return (<ul>{posts.map(p=>(<li key={p._id}><Link to={'/post/'+p._id}>{p.title}</Link> by {p.author?.username}</li>))}</ul>);
}
