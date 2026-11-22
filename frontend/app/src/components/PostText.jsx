import { A } from '@solidjs/router';
import { For, Show } from 'solid-js';
import { tokenizePostText } from '../utils/postText';
import { withQuery } from '../utils/urls';

export default function PostText(props) {
  return <For each={tokenizePostText(props.text)}>{(token) => (
    <Show when={token.query} fallback={token.text}>
      <Show when={!props.preview} fallback={<span class="post-hashtag">{token.text}</span>}>
        <A class="post-hashtag" href={withQuery('/search', { q: token.query, type: 'posts' })}>{token.text}</A>
      </Show>
    </Show>
  )}</For>;
}
