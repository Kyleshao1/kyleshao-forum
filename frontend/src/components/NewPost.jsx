import { useState } from 'react';
import api from '../api';

export default function NewPost() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      await api.createPost({ title, content });
      setMessage('✅ 创建成功!');
      setTitle('');
      setContent('');
    } catch {
      setMessage('❌ 创建失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="标题"
        value={title}
        onChange={e => setTitle(e.target.value)}
        required
      />
      <textarea
        placeholder="内容"
        value={content}
        onChange={e => setContent(e.target.value)}
        required
      />
      <button type="提交" disabled={loading}>
        {loading ? '提交中' : 'Publish'}
      </button>
      {message && <p>{message}</p>}
    </form>
  );
}
