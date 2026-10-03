/** Tool definitions per platform. Names, schemas and limits follow the 2d contract. */
export type Platform = 'x' | 'instagram' | 'tiktok';
export const PLATFORMS: readonly Platform[] = ['x', 'instagram', 'tiktok'];

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties: false };
}

const X_ID = '^[0-9]{1,19}$';
const maxResults = { type: 'integer', minimum: 5, maximum: 100, description: 'Number of items to return. Default 10.' };
const xId = (d: string) => ({ type: 'string', pattern: X_ID, description: d });
const text280 = { type: 'string', minLength: 1, maxLength: 280, description: 'Post text, up to 280 characters.' };
const obj = (properties: Record<string, unknown>, required: string[] = []): ToolDef['inputSchema'] => ({
  type: 'object',
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});

const X_TOOLS: ToolDef[] = [
  { name: 'read_home_timeline', description: "Read the connected user's own home timeline on X.", inputSchema: obj({ max_results: maxResults }) },
  { name: 'read_mentions', description: 'Read recent posts on X that mention the connected user.', inputSchema: obj({ max_results: maxResults }) },
  { name: 'read_dms', description: "Read recent direct messages on X for the connected user.", inputSchema: obj({ max_results: maxResults }) },
  { name: 'post', description: 'Publish a new post on X as the connected user.', inputSchema: obj({ text: text280 }, ['text']) },
  { name: 'reply', description: 'Publish a reply to an existing post on X.', inputSchema: obj({ in_reply_to_id: xId('Id of the post being replied to.'), text: text280 }, ['in_reply_to_id', 'text']) },
  {
    name: 'send_dm',
    description: 'Send a direct message on X to one user.',
    inputSchema: obj({ recipient_id: xId('X user id of the recipient.'), text: { type: 'string', minLength: 1, maxLength: 10000, description: 'Message text, up to 10000 characters.' } }, ['recipient_id', 'text']),
  },
  { name: 'follow', description: 'Follow a user on X.', inputSchema: obj({ target_user_id: xId('X user id to follow.') }, ['target_user_id']) },
  { name: 'unfollow', description: 'Unfollow a user on X.', inputSchema: obj({ target_user_id: xId('X user id to unfollow.') }, ['target_user_id']) },
  { name: 'delete_post', description: "Delete one of the connected user's own posts on X.", inputSchema: obj({ post_id: xId('Id of the post to delete.') }, ['post_id']) },
];

const limit = (max: number) => ({ type: 'integer', minimum: 1, maximum: max, description: `Number of items to return, up to ${max}.` });
const url = { type: 'string', format: 'uri', maxLength: 2048, pattern: '^https://' };
const caption = { type: 'string', maxLength: 2200, description: 'Caption, up to 2200 characters.' };
const platId = (d: string) => ({ type: 'string', pattern: '^[0-9A-Za-z_-]{1,64}$', description: d });

const INSTAGRAM_TOOLS: ToolDef[] = [
  { name: 'read_media', description: "Read the connected user's recent Instagram media. Not yet available.", inputSchema: obj({ limit: limit(50) }) },
  { name: 'read_comments', description: 'Read comments on one Instagram media item. Not yet available.', inputSchema: obj({ media_id: platId('Media id.') }, ['media_id']) },
  { name: 'publish_post', description: 'Publish an image post on Instagram. Not yet available.', inputSchema: obj({ image_url: url, caption }, ['image_url', 'caption']) },
  { name: 'reply_comment', description: 'Reply to a comment on Instagram. Not yet available.', inputSchema: obj({ comment_id: platId('Comment id.'), text: { type: 'string', minLength: 1, maxLength: 2200 } }, ['comment_id', 'text']) },
];

// TikTok exposes no direct message tools (D7).
const TIKTOK_TOOLS: ToolDef[] = [
  { name: 'read_videos', description: "Read the connected user's recent TikTok videos. Not yet available.", inputSchema: obj({ limit: limit(20) }) },
  { name: 'publish_video', description: 'Publish a video on TikTok. Not yet available.', inputSchema: obj({ video_url: url, caption }, ['video_url', 'caption']) },
];

export const TOOLS: Record<Platform, ToolDef[]> = { x: X_TOOLS, instagram: INSTAGRAM_TOOLS, tiktok: TIKTOK_TOOLS };

export function isPlatform(v: unknown): v is Platform {
  return typeof v === 'string' && (PLATFORMS as readonly string[]).includes(v);
}
