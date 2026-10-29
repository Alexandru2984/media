import { A, useNavigate } from '@solidjs/router';
import { For, Show, createEffect, createSignal } from 'solid-js';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import Navbar from '../components/Navbar';
import PageMeta from '../components/PageMeta';
import { getImageUrl } from '../utils/urls';

const PAGE_SIZE = 20;
const dateFormatter = new Intl.DateTimeFormat('ro-RO', { dateStyle: 'medium', timeStyle: 'short' });
const reasonLabels = {
  spam: 'Spam sau înșelătorie',
  harassment: 'Hărțuire sau intimidare',
  hate: 'Discurs instigator la ură',
  violence: 'Violență sau amenințări',
  sexual: 'Conținut sexual',
  self_harm: 'Autovătămare',
  impersonation: 'Uzurpare de identitate',
  privacy: 'Încălcarea vieții private',
  illegal: 'Activitate ilegală',
  other: 'Alt motiv',
};
const targetLabels = { user: 'Cont', post: 'Postare', comment: 'Comentariu' };

export default function SafetyCenter() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = createSignal('reports');
  const [reports, setReports] = createSignal([]);
  const [mutedUsers, setMutedUsers] = createSignal([]);
  const [hiddenPosts, setHiddenPosts] = createSignal([]);
  const [reportsMore, setReportsMore] = createSignal(false);
  const [mutesMore, setMutesMore] = createSignal(false);
  const [hiddenMore, setHiddenMore] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [pendingAction, setPendingAction] = createSignal('');
  const [error, setError] = createSignal('');
  const [loadedForUser, setLoadedForUser] = createSignal(null);

  const loadInitial = async () => {
    setLoading(true);
    setError('');
    try {
      const [reportData, muteData, hiddenData] = await Promise.all([
        api.getReports(PAGE_SIZE, 0),
        api.getMutedUsers(PAGE_SIZE, 0),
        api.getHiddenPosts(PAGE_SIZE, 0),
      ]);
      setReports(reportData);
      setMutedUsers(muteData);
      setHiddenPosts(hiddenData);
      setReportsMore(reportData.length === PAGE_SIZE);
      setMutesMore(muteData.length === PAGE_SIZE);
      setHiddenMore(hiddenData.length === PAGE_SIZE);
    } catch (requestError) {
      console.error('Failed to load safety center:', requestError);
      setError('Centrul de siguranță nu a putut fi încărcat. Încearcă din nou.');
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (loadingMore()) return;
    setLoadingMore(true);
    setError('');
    try {
      if (activeTab() === 'reports') {
        const data = await api.getReports(PAGE_SIZE, reports().length);
        setReports((current) => [...current, ...data]);
        setReportsMore(data.length === PAGE_SIZE);
      } else if (activeTab() === 'muted') {
        const data = await api.getMutedUsers(PAGE_SIZE, mutedUsers().length);
        setMutedUsers((current) => [...current, ...data]);
        setMutesMore(data.length === PAGE_SIZE);
      } else {
        const data = await api.getHiddenPosts(PAGE_SIZE, hiddenPosts().length);
        setHiddenPosts((current) => [...current, ...data]);
        setHiddenMore(data.length === PAGE_SIZE);
      }
    } catch (requestError) {
      console.error('Failed to load more safety records:', requestError);
      setError('Nu am putut încărca mai multe elemente.');
    } finally {
      setLoadingMore(false);
    }
  };

  const withdrawReport = async (report) => {
    if (pendingAction() || !window.confirm('Retragi această raportare? Limita anti-abuz nu se resetează.')) return;
    setPendingAction(`report:${report.id}`);
    setError('');
    try {
      await api.withdrawReport(report.id);
      setReports((current) => current.filter((item) => item.id !== report.id));
    } catch (requestError) {
      console.error('Failed to withdraw report:', requestError);
      if (requestError.status === 404) {
        setReports((current) => current.filter((item) => item.id !== report.id));
      } else {
        setError('Raportarea nu a putut fi retrasă.');
      }
    } finally {
      setPendingAction('');
    }
  };

  const unmute = async (user) => {
    if (pendingAction()) return;
    setPendingAction(`mute:${user.id}`);
    setError('');
    try {
      await api.unmuteUser(user.id);
      setMutedUsers((current) => current.filter((item) => item.id !== user.id));
    } catch (requestError) {
      console.error('Failed to unmute user:', requestError);
      setError('Contul nu a putut fi reactivat.');
    } finally {
      setPendingAction('');
    }
  };

  const unhide = async (post) => {
    if (pendingAction()) return;
    setPendingAction(`hidden:${post.post_id}`);
    setError('');
    try {
      await api.unhidePost(post.post_id);
      setHiddenPosts((current) => current.filter((item) => item.post_id !== post.post_id));
    } catch (requestError) {
      console.error('Failed to unhide post:', requestError);
      setError('Postarea nu a putut fi reafișată.');
    } finally {
      setPendingAction('');
    }
  };

  const hasMore = () => (
    activeTab() === 'reports' ? reportsMore() : (activeTab() === 'muted' ? mutesMore() : hiddenMore())
  );

  createEffect(() => {
    if (auth.loading()) return;
    if (!auth.isAuthenticated()) {
      navigate('/login');
      return;
    }
    const userId = auth.user()?.id;
    if (userId && loadedForUser() !== userId) {
      setLoadedForUser(userId);
      void loadInitial();
    }
  });

  return (
    <>
      <PageMeta
        title="Centru de siguranță — Media"
        description="Administrează raportările, conturile silențiate și postările ascunse pe Media."
        canonicalPath="/siguranta"
        noIndex
      />
      <Navbar />
      <main class="safety-page app-container">
        <header class="safety-hero">
          <span class="safety-hero-icon" aria-hidden="true">
            <svg width="27" height="27" viewBox="0 0 24 24" fill="none"><path d="M12 3 4.5 6v5.5c0 4.8 3 7.9 7.5 9.5 4.5-1.6 7.5-4.7 7.5-9.5V6L12 3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /><path d="m8.7 12 2.1 2.1 4.5-4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </span>
          <div>
            <p class="sidebar-eyebrow">Control și confidențialitate</p>
            <h1>Centru de siguranță</h1>
            <p>Gestionează discret ce nu vrei să vezi și raportările trimise de tine.</p>
          </div>
        </header>

        <div class="surface safety-note">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" /><path d="M12 11v5m0-8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
          <p>Aceste liste sunt private. Silențierea nu notifică persoana, iar identitatea ta nu este afișată conturilor raportate. Vezi și <A href="/reguli">regulile comunității</A>.</p>
        </div>

        <div class="safety-tabs" role="tablist" aria-label="Controale de siguranță">
          <button type="button" role="tab" aria-selected={activeTab() === 'reports'} class={activeTab() === 'reports' ? 'is-active' : ''} onClick={() => setActiveTab('reports')}>
            Raportări <span>{reports().length}</span>
          </button>
          <button type="button" role="tab" aria-selected={activeTab() === 'muted'} class={activeTab() === 'muted' ? 'is-active' : ''} onClick={() => setActiveTab('muted')}>
            Silențiate <span>{mutedUsers().length}</span>
          </button>
          <button type="button" role="tab" aria-selected={activeTab() === 'hidden'} class={activeTab() === 'hidden' ? 'is-active' : ''} onClick={() => setActiveTab('hidden')}>
            Ascunse <span>{hiddenPosts().length}</span>
          </button>
        </div>

        <Show when={error()}><p class="alert alert-error safety-alert" role="alert">{error()}</p></Show>
        <Show
          when={!loading()}
          fallback={<div class="surface skeleton"><div class="skeleton-lines"><div class="skeleton-line" /><div class="skeleton-line" /><div class="skeleton-line" /></div></div>}
        >
          <Show when={activeTab() === 'reports'}>
            <Show when={reports().length > 0} fallback={<div class="surface state-card"><div><span class="state-icon">✓</span><h2>Nicio raportare deschisă</h2><p>Raportările trimise de la profiluri, postări sau comentarii vor apărea aici.</p></div></div>}>
              <div class="safety-list">
                <For each={reports()}>{(report) => (
                  <article class="surface safety-card safety-report-card">
                    <span class="safety-card-icon" aria-hidden="true">!</span>
                    <div class="safety-card-copy">
                      <p class="safety-card-kicker">{targetLabels[report.target_type] || 'Conținut'} raportat</p>
                      <h2>{report.target_label || 'Element indisponibil'}</h2>
                      <p>{reasonLabels[report.reason] || 'Alt motiv'}<Show when={report.details}> · {report.details}</Show></p>
                      <time datetime={report.created_at}>{dateFormatter.format(new Date(report.created_at))}</time>
                    </div>
                    <button type="button" class="btn btn-danger-ghost" onClick={() => withdrawReport(report)} disabled={Boolean(pendingAction())}>
                      {pendingAction() === `report:${report.id}` ? 'Se retrage…' : 'Retrage'}
                    </button>
                  </article>
                )}</For>
              </div>
            </Show>
          </Show>

          <Show when={activeTab() === 'muted'}>
            <Show when={mutedUsers().length > 0} fallback={<div class="surface state-card"><div><span class="state-icon">◌</span><h2>Niciun cont silențiat</h2><p>Poți opri discret conținutul și notificările unui cont din pagina sa de profil.</p></div></div>}>
              <div class="safety-list">
                <For each={mutedUsers()}>{(user) => (
                  <article class="surface safety-card">
                    <A href={`/profile/${user.id}`} class="safety-avatar-link" aria-label={`Deschide profilul ${user.username}`}>
                      <Show when={user.avatar_url} fallback={<span class="safety-avatar avatar-fallback">{user.username.charAt(0).toUpperCase()}</span>}>
                        <img class="safety-avatar avatar" src={getImageUrl(user.avatar_url)} alt="" loading="lazy" decoding="async" />
                      </Show>
                    </A>
                    <div class="safety-card-copy">
                      <p class="safety-card-kicker">Cont silențiat</p>
                      <h2><A href={`/profile/${user.id}`}>{user.username}</A></h2>
                      <p>{user.bio || 'Conținutul acestui cont este eliminat din fluxurile tale.'}</p>
                      <time datetime={user.muted_at}>Din {dateFormatter.format(new Date(user.muted_at))}</time>
                    </div>
                    <button type="button" class="btn btn-secondary" onClick={() => unmute(user)} disabled={Boolean(pendingAction())}>
                      {pendingAction() === `mute:${user.id}` ? 'Se actualizează…' : 'Reactivează'}
                    </button>
                  </article>
                )}</For>
              </div>
            </Show>
          </Show>

          <Show when={activeTab() === 'hidden'}>
            <Show when={hiddenPosts().length > 0} fallback={<div class="surface state-card"><div><span class="state-icon">◉</span><h2>Nicio postare ascunsă</h2><p>Postările ascunse din flux și căutare pot fi readuse de aici.</p></div></div>}>
              <div class="safety-list">
                <For each={hiddenPosts()}>{(post) => (
                  <article class="surface safety-card">
                    <Show when={post.author} fallback={<span class="safety-avatar avatar-fallback">?</span>}>
                      <A href={`/profile/${post.author.id}`} class="safety-avatar-link">
                        <Show when={post.author.avatar_url} fallback={<span class="safety-avatar avatar-fallback">{post.author.username.charAt(0).toUpperCase()}</span>}>
                          <img class="safety-avatar avatar" src={getImageUrl(post.author.avatar_url)} alt="" loading="lazy" decoding="async" />
                        </Show>
                      </A>
                    </Show>
                    <div class="safety-card-copy">
                      <p class="safety-card-kicker">Postare ascunsă</p>
                      <h2>{post.author?.username || 'Postare indisponibilă'}</h2>
                      <p>{post.available ? 'Nu mai apare în fluxuri, căutare sau colecția de postări salvate.' : 'Conținutul nu mai este disponibil pentru acest cont.'}</p>
                      <time datetime={post.hidden_at}>Ascunsă la {dateFormatter.format(new Date(post.hidden_at))}</time>
                    </div>
                    <button type="button" class="btn btn-secondary" onClick={() => unhide(post)} disabled={Boolean(pendingAction())}>
                      {pendingAction() === `hidden:${post.post_id}` ? 'Se actualizează…' : 'Reafișează'}
                    </button>
                  </article>
                )}</For>
              </div>
            </Show>
          </Show>

          <Show when={hasMore()}>
            <div class="safety-load-more"><button type="button" class="btn btn-secondary" onClick={loadMore} disabled={loadingMore()}>{loadingMore() ? 'Se încarcă…' : 'Încarcă mai multe'}</button></div>
          </Show>
        </Show>
      </main>
    </>
  );
}
