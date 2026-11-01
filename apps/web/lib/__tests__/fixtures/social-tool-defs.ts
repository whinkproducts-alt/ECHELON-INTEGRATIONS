/**
 * Snapshot of the social upstream tool definitions (services/openclaw/upstreams/social/src/tools.ts),
 * as the gateway advertises them: name is `<platform>__<tool>`. Used to test the class map and the
 * defHash binding in config/tool-classes.json. If the upstream changes, the hash test fails: re-run
 * scripts/tool-def-hash.ts against the live gateway and update config/tool-classes.json.
 */
export interface SocialToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const SOCIAL_TOOL_DEFS: SocialToolDef[] = [
  {
    "name": "x__read_home_timeline",
    "description": "Read the connected user's own home timeline on X.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "max_results": {
          "type": "integer",
          "minimum": 5,
          "maximum": 100,
          "description": "Number of items to return. Default 10."
        }
      },
      "additionalProperties": false
    }
  },
  {
    "name": "x__read_mentions",
    "description": "Read recent posts on X that mention the connected user.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "max_results": {
          "type": "integer",
          "minimum": 5,
          "maximum": 100,
          "description": "Number of items to return. Default 10."
        }
      },
      "additionalProperties": false
    }
  },
  {
    "name": "x__read_dms",
    "description": "Read recent direct messages on X for the connected user.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "max_results": {
          "type": "integer",
          "minimum": 5,
          "maximum": 100,
          "description": "Number of items to return. Default 10."
        }
      },
      "additionalProperties": false
    }
  },
  {
    "name": "x__post",
    "description": "Publish a new post on X as the connected user.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "text": {
          "type": "string",
          "minLength": 1,
          "maxLength": 280,
          "description": "Post text, up to 280 characters."
        }
      },
      "required": [
        "text"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "x__reply",
    "description": "Publish a reply to an existing post on X.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "in_reply_to_id": {
          "type": "string",
          "pattern": "^[0-9]{1,19}$",
          "description": "Id of the post being replied to."
        },
        "text": {
          "type": "string",
          "minLength": 1,
          "maxLength": 280,
          "description": "Post text, up to 280 characters."
        }
      },
      "required": [
        "in_reply_to_id",
        "text"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "x__send_dm",
    "description": "Send a direct message on X to one user.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "recipient_id": {
          "type": "string",
          "pattern": "^[0-9]{1,19}$",
          "description": "X user id of the recipient."
        },
        "text": {
          "type": "string",
          "minLength": 1,
          "maxLength": 10000,
          "description": "Message text, up to 10000 characters."
        }
      },
      "required": [
        "recipient_id",
        "text"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "x__follow",
    "description": "Follow a user on X.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "target_user_id": {
          "type": "string",
          "pattern": "^[0-9]{1,19}$",
          "description": "X user id to follow."
        }
      },
      "required": [
        "target_user_id"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "x__unfollow",
    "description": "Unfollow a user on X.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "target_user_id": {
          "type": "string",
          "pattern": "^[0-9]{1,19}$",
          "description": "X user id to unfollow."
        }
      },
      "required": [
        "target_user_id"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "x__delete_post",
    "description": "Delete one of the connected user's own posts on X.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "post_id": {
          "type": "string",
          "pattern": "^[0-9]{1,19}$",
          "description": "Id of the post to delete."
        }
      },
      "required": [
        "post_id"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "instagram__read_media",
    "description": "Read the connected user's recent Instagram media. Not yet available.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 50,
          "description": "Number of items to return, up to 50."
        }
      },
      "additionalProperties": false
    }
  },
  {
    "name": "instagram__read_comments",
    "description": "Read comments on one Instagram media item. Not yet available.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "media_id": {
          "type": "string",
          "pattern": "^[0-9A-Za-z_-]{1,64}$",
          "description": "Media id."
        }
      },
      "required": [
        "media_id"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "instagram__publish_post",
    "description": "Publish an image post on Instagram. Not yet available.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "image_url": {
          "type": "string",
          "format": "uri",
          "maxLength": 2048,
          "pattern": "^https://"
        },
        "caption": {
          "type": "string",
          "maxLength": 2200,
          "description": "Caption, up to 2200 characters."
        }
      },
      "required": [
        "image_url",
        "caption"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "instagram__reply_comment",
    "description": "Reply to a comment on Instagram. Not yet available.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "comment_id": {
          "type": "string",
          "pattern": "^[0-9A-Za-z_-]{1,64}$",
          "description": "Comment id."
        },
        "text": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2200
        }
      },
      "required": [
        "comment_id",
        "text"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "tiktok__read_videos",
    "description": "Read the connected user's recent TikTok videos. Not yet available.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 20,
          "description": "Number of items to return, up to 20."
        }
      },
      "additionalProperties": false
    }
  },
  {
    "name": "tiktok__publish_video",
    "description": "Publish a video on TikTok. Not yet available.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "video_url": {
          "type": "string",
          "format": "uri",
          "maxLength": 2048,
          "pattern": "^https://"
        },
        "caption": {
          "type": "string",
          "maxLength": 2200,
          "description": "Caption, up to 2200 characters."
        }
      },
      "required": [
        "video_url",
        "caption"
      ],
      "additionalProperties": false
    }
  }
];

