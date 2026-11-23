import { Show } from 'solid-js';
import PostText from './PostText';
import { getImageUrl } from '../utils/urls';
import ContentNotice from './ContentNotice';

export default function ComposerPreview(props) {
  return (
    <section class="composer-publish-preview" aria-label="Previzualizarea postării">
      <p class="composer-preview-notice">Previzualizare · Postarea nu a fost publicată.</p>
      <div class="post-author">
        <Show when={props.user?.avatar_url} fallback={<span class="avatar-fallback">{props.user?.username?.charAt(0).toUpperCase()}</span>}>
          <img class="avatar" src={getImageUrl(props.user?.avatar_url)} alt="" />
        </Show>
        <span class="post-author-copy"><span class="post-author-name">{props.user?.username}</span><span class="post-time">{props.user?.is_private ? 'Cont privat · urmăritori aprobați' : 'Cont public'}</span></span>
      </div>
      <ContentNotice label={props.contentWarning?.trim()} resetKey={props.content}>
      <p class="post-content"><PostText text={props.content.trim()} preview /></p>
      <Show when={props.image}><img class="post-media" src={props.image} alt={props.imageAlt?.trim() || 'Imaginea selectată pentru această postare'} /></Show>
      </ContentNotice>
      <p class="composer-preview-notice">Poți continua să editezi textul și imaginea înainte de publicare.</p>
    </section>
  );
}
