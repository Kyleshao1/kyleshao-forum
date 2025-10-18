import { useState } from 'react';
import api from '../api';
import { useAuth } from '../auth/AuthProvider';

export default function NewPost(){
  const { user } = useAuth();
  const [form,setForm] = useState({ title:'', content:'' });
  const submit = async (e) => { e.preventDefault(); if(!user) return alert('请先登录'); await api.post('/post', form, { headers: { Authorization: 'Bearer '+user.token } }); window.location.reload(); };
  return (<div><h3>发帖</h3><form onSubmit={submit}><input placeholder='标题' value={form.title} onChange={e=>setForm({...form,title:e.target.value})} /><br/><textarea placeholder='内容 Markdown' value={form.content} onChange={e=>setForm({...form,content:e.target.value})} /><br/><button type='submit'>发布</button></form></div>);
}
