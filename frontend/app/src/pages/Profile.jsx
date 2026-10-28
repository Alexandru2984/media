import { useNavigate, useParams } from '@solidjs/router';
import { createEffect, createSignal, For, Show } from 'solid-js';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import Navbar from '../components/Navbar';
import PostCard from '../components/PostCard';
import ProfileSettings from '../components/ProfileSettings';
import { getImageUrl } from '../utils/urls';

function joinedDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ro-RO', { month: 'long', year: 'numeric' });
}

export default function Profile() {
  const params = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const [profile, setProfile] = createSignal(null);
  const [posts, setPosts] = createSignal([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal('');
  const [editing, setEditing] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [username, setUsername] = createSignal('');
  const [bio, setBio] = createSignal('');
  const [activeTab, setActiveTab] = createSignal('posts');
  const [loadedProfileId, setLoadedProfileId] = createSignal(null);

  const isOwnProfile = () => auth.user()?.id === params.id;

  const loadProfile = async (userId = params.id, showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      setError('');
      const [profileData, userPosts] = await Promise.all([
        api.getProfile(userId),
        api.getUserPosts(userId),
      ]);
      setProfile(profileData);
      setUsername(profileData.username);
      setBio(profileData.bio || '');
      setPosts(userPosts);
    } catch (requestError) {
      console.error('Failed to load profile:', requestError);
      setError('Profilul nu a putut fi încărcat. Este posibil să nu mai existe.');
    } finally {
      setLoading(false);
    }
  };

  const cancelEditing = () => {
    setEditing(false);
    setUsername(profile()?.username || '');
    setBio(profile()?.bio || '');
  };

  const handleSave = async () => {
    const cleanUsername = username().trim();
    if (cleanUsername.length < 2 || saving()) return;

    setSaving(true);
    setError('');
    try {
      await api.updateProfile(cleanUsername, bio().trim(), null);
      await loadProfile(params.id, false);
      const userData = await api.getCurrentUser();
      auth.setUser(userData);
      setEditing(false);
    } catch (requestError) {
      console.error('Failed to update profile:', requestError);
      setError('Profilul nu a putut fi actualizat. Numele poate fi deja folosit.');
    } finally {
      setSaving(false);
    }
  };

  createEffect(() => {
    const userId = params.id;
    if (auth.loading()) return;
    if (!auth.isAuthenticated()) {
      navigate('/login');
      return;
    }
    if (userId && loadedProfileId() !== userId) {
      setLoadedProfileId(userId);
      setProfile(null);
      setPosts([]);
      setActiveTab('posts');
      setEditing(false);
      loadProfile(userId);
    }
  });

  return (
    <>
      <Navbar />
      <main class="profile-page app-container">
        <Show
          when={!loading()}
          fallback={
            <div class="profile-loading" aria-busy="true">
              <div class="surface skeleton"><div class="skeleton-lines"><div class="skeleton-line" /><div class="skeleton-line" /><div class="skeleton-line" /></div></div>
            </div>
          }
        >
          <Show
            when={!error() || profile()}
            fallback={
              <div class="surface state-card" role="alert">
                <div>
                  <span class="state-icon"><svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8" /><path d="M4 21a8 8 0 0 1 16 0" stroke="currentColor" stroke-width="1.8" /></svg></span>
                  <h2>Profil indisponibil</h2>
                  <p>{error()}</p>
                  <button type="button" class="btn btn-primary" onClick={() => loadProfile()} style={{ 'margin-top': '20px' }}>Încearcă din nou</button>
                </div>
              </div>
            }
          >
            <section class="surface profile-hero" aria-labelledby="profile-name">
              <div class="profile-cover" />
              <div class="profile-body">
                <div class="profile-avatar-wrap">
                  <Show
                    when={profile()?.avatar_url}
                    fallback={<span class="profile-avatar avatar-fallback">{profile()?.username?.charAt(0).toUpperCase()}</span>}
                  >
                    <img class="profile-avatar avatar" src={getImageUrl(profile()?.avatar_url)} alt={`Avatarul lui ${profile()?.username}`} />
                  </Show>
                </div>

                <div class="profile-action-row">
                  <Show when={isOwnProfile() && !editing()}>
                    <button type="button" class="btn btn-secondary" onClick={() => setEditing(true)}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14 5 5 5M4 20l3.5-.7L20 6.8a2.1 2.1 0 0 0-3-3L4.7 16.3 4 20Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
                      Editează profilul
                    </button>
                  </Show>
                </div>

                <Show
                  when={!editing()}
                  fallback={
                    <div class="profile-editor">
                      <div>
                        <label class="field-label" for="profile-username">Nume de utilizator</label>
                        <input id="profile-username" class="input" value={username()} onInput={(event) => setUsername(event.currentTarget.value)} minlength="2" maxlength="32" />
                      </div>
                      <div>
                        <label class="field-label" for="profile-bio">Descriere</label>
                        <textarea id="profile-bio" class="textarea" value={bio()} onInput={(event) => setBio(event.currentTarget.value)} rows="3" maxlength="240" placeholder="Spune comunității câteva lucruri despre tine…" />
                        <div class="character-count">{bio().length}/240</div>
                      </div>
                      <div class="profile-editor-actions">
                        <button type="button" class="btn btn-secondary" onClick={cancelEditing} disabled={saving()}>Anulează</button>
                        <button type="button" class="btn btn-primary" onClick={handleSave} disabled={saving() || username().trim().length < 2}>{saving() ? 'Se salvează…' : 'Salvează'}</button>
                      </div>
                    </div>
                  }
                >
                  <div class="profile-copy">
                    <h1 id="profile-name">{profile()?.username}</h1>
                    <p class={`profile-bio ${profile()?.bio ? '' : 'is-empty'}`}>{profile()?.bio || 'Acest profil nu are încă o descriere.'}</p>
                    <div class="profile-meta">
                      <span><strong>{profile()?.posts_count ?? posts().length}</strong> {Number(profile()?.posts_count ?? posts().length) === 1 ? 'postare' : 'postări'}</span>
                      <Show when={joinedDate(profile()?.created_at)}>
                        <span>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8" /><path d="M8 3v4m8-4v4M3 10h18" stroke="currentColor" stroke-width="1.8" /></svg>
                          Membru din {joinedDate(profile()?.created_at)}
                        </span>
                      </Show>
                    </div>
                  </div>
                </Show>

                <Show when={error()}><p class="alert alert-error profile-alert" role="alert">{error()}</p></Show>
              </div>
            </section>

            <Show when={isOwnProfile()}>
              <div class="profile-tabs" role="tablist" aria-label="Secțiunile profilului">
                <button type="button" role="tab" aria-selected={activeTab() === 'posts'} class={activeTab() === 'posts' ? 'is-active' : ''} onClick={() => setActiveTab('posts')}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8m-8 4h8m-8 4h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
                  Postări
                </button>
                <button type="button" role="tab" aria-selected={activeTab() === 'settings'} class={activeTab() === 'settings' ? 'is-active' : ''} onClick={() => setActiveTab('settings')}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" /></svg>
                  Setări
                </button>
              </div>
            </Show>

            <Show when={activeTab() === 'posts' || !isOwnProfile()}>
              <section class="profile-feed" aria-labelledby="profile-posts-title">
                <h2 id="profile-posts-title">Postări</h2>
                <Show
                  when={posts().length > 0}
                  fallback={<div class="surface state-card"><div><span class="state-icon"><svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5h16v12H8l-4 4V5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg></span><h2>Nicio postare încă</h2><p>Postările publicate de acest utilizator vor apărea aici.</p></div></div>}
                >
                  <div class="feed-list"><For each={posts()}>{(post) => <PostCard post={post} onDelete={() => loadProfile(params.id, false)} onUpdate={() => loadProfile(params.id, false)} />}</For></div>
                </Show>
              </section>
            </Show>

            <Show when={activeTab() === 'settings' && isOwnProfile()}>
              <ProfileSettings onUpdate={() => loadProfile(params.id, false)} />
            </Show>
          </Show>
        </Show>
      </main>
    </>
  );
}
