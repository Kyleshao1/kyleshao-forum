import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import api from '../api';

export default function Post(){
  const { id } = useParams();
  const [post, setPost] = useState(null);
  useEffect(()=>{ api.get('/post/'+id).then(r=>setPost(r.data)); },[id]);
  if(!post) return <p>加载中...</p>;
  return (<div><h2>{post.title}</h2><div dangerouslySetInnerHTML={{__html:post.content}} /></div>);
}
