import { useEffect, useState } from 'react';
import api from '../api';
import { Link } from 'react-router-dom';

export default function PostList() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getPosts()
      .then(data => setPosts(data))
      .catch(() => setError('Failed to load posts'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading posts...</p>;
  if (error) return <p>{error}</p>;
  if (posts.length === 0) return <p>No posts yet.</p>;

  return (
    <div className="post-list">
      {posts.map(p => (
        <div key={p._id} className="post-item">
          <Link to={`/posts/${p._id}`}><h3>{p.title}</h3></Link>
          <p>{p.content.slice(0, 100)}...</p>
        </div>
      ))}
    </div>
  );
}
