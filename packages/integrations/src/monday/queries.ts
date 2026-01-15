/**
 * @fileoverview Monday.com GraphQL queries and mutations.
 * @packageDocumentation
 */

/**
 * Query fragments for reuse.
 */
export const FRAGMENTS = {
  USER: `
    fragment UserFields on User {
      id
      name
      email
      url
      photo_thumb
      title
      created_at
      enabled
      is_admin
      is_guest
      is_view_only
    }
  `,

  COLUMN: `
    fragment ColumnFields on Column {
      id
      title
      type
      archived
      description
      settings_str
      width
    }
  `,

  GROUP: `
    fragment GroupFields on Group {
      id
      title
      color
      archived
      deleted
      position
    }
  `,

  COLUMN_VALUE: `
    fragment ColumnValueFields on ColumnValue {
      id
      text
      value
      type
    }
  `,

  ITEM_BASE: `
    fragment ItemBaseFields on Item {
      id
      name
      created_at
      updated_at
      state
      url
      relative_link
      creator_id
    }
  `,

  BOARD_BASE: `
    fragment BoardBaseFields on Board {
      id
      name
      description
      board_kind
      state
      url
      items_count
      created_at
      updated_at
      workspace_id
    }
  `,
};

/**
 * Queries for Monday.com GraphQL API.
 */
export const QUERIES = {
  /**
   * Get current user info.
   */
  ME: `
    query Me {
      me {
        ...UserFields
        account {
          id
          name
          slug
          tier
        }
        teams {
          id
          name
        }
      }
    }
    ${FRAGMENTS.USER}
  `,

  /**
   * Get account info.
   */
  ACCOUNT: `
    query Account {
      account {
        id
        name
        slug
        logo
        tier
        plan {
          max_users
          period
          tier
          version
        }
      }
    }
  `,

  /**
   * List workspaces.
   */
  WORKSPACES: `
    query Workspaces($limit: Int, $page: Int) {
      workspaces(limit: $limit, page: $page) {
        id
        name
        kind
        description
        created_at
      }
    }
  `,

  /**
   * List boards.
   */
  BOARDS: `
    query Boards($limit: Int, $page: Int, $state: State, $workspace_ids: [ID!], $board_kind: BoardKind) {
      boards(
        limit: $limit
        page: $page
        state: $state
        workspace_ids: $workspace_ids
        board_kind: $board_kind
      ) {
        ...BoardBaseFields
        columns {
          ...ColumnFields
        }
        groups {
          ...GroupFields
        }
        owners {
          ...UserFields
        }
        workspace {
          id
          name
        }
      }
    }
    ${FRAGMENTS.BOARD_BASE}
    ${FRAGMENTS.COLUMN}
    ${FRAGMENTS.GROUP}
    ${FRAGMENTS.USER}
  `,

  /**
   * Get a single board.
   */
  BOARD: `
    query Board($ids: [ID!]!) {
      boards(ids: $ids) {
        ...BoardBaseFields
        columns {
          ...ColumnFields
        }
        groups {
          ...GroupFields
        }
        owners {
          ...UserFields
        }
        subscribers {
          ...UserFields
        }
        workspace {
          id
          name
        }
        permissions
        type
      }
    }
    ${FRAGMENTS.BOARD_BASE}
    ${FRAGMENTS.COLUMN}
    ${FRAGMENTS.GROUP}
    ${FRAGMENTS.USER}
  `,

  /**
   * List items in a board.
   */
  ITEMS: `
    query Items($board_id: ID!, $limit: Int, $cursor: String, $group_id: String, $column_ids: [String!]) {
      boards(ids: [$board_id]) {
        items_page(limit: $limit, cursor: $cursor, query_params: {
          rules: [
            { column_id: "group", compare_value: $group_id }
          ]
        }) {
          cursor
          items {
            ...ItemBaseFields
            column_values(ids: $column_ids) {
              ...ColumnValueFields
            }
            group {
              ...GroupFields
            }
            creator {
              ...UserFields
            }
            parent_item {
              id
              name
            }
            subitems {
              id
              name
              state
            }
          }
        }
      }
    }
    ${FRAGMENTS.ITEM_BASE}
    ${FRAGMENTS.COLUMN_VALUE}
    ${FRAGMENTS.GROUP}
    ${FRAGMENTS.USER}
  `,

  /**
   * Get a single item.
   */
  ITEM: `
    query Item($ids: [ID!]!) {
      items(ids: $ids) {
        ...ItemBaseFields
        board {
          id
          name
        }
        column_values {
          ...ColumnValueFields
          column {
            ...ColumnFields
          }
        }
        group {
          ...GroupFields
        }
        creator {
          ...UserFields
        }
        parent_item {
          id
          name
        }
        subscribers {
          ...UserFields
        }
        subitems {
          ...ItemBaseFields
          column_values {
            ...ColumnValueFields
          }
          group {
            ...GroupFields
          }
        }
      }
    }
    ${FRAGMENTS.ITEM_BASE}
    ${FRAGMENTS.COLUMN_VALUE}
    ${FRAGMENTS.COLUMN}
    ${FRAGMENTS.GROUP}
    ${FRAGMENTS.USER}
  `,

  /**
   * Get updates (comments) for an item.
   */
  UPDATES: `
    query Updates($item_id: ID!, $limit: Int, $page: Int) {
      items(ids: [$item_id]) {
        updates(limit: $limit, page: $page) {
          id
          body
          text_body
          created_at
          updated_at
          creator {
            ...UserFields
          }
          replies {
            id
            body
            text_body
            created_at
            creator {
              ...UserFields
            }
          }
          assets {
            id
            name
            url
            file_size
          }
        }
      }
    }
    ${FRAGMENTS.USER}
  `,

  /**
   * Search items by text.
   */
  SEARCH_ITEMS: `
    query SearchItems($query: String!, $limit: Int) {
      items_page_by_column_values(
        limit: $limit
        board_id: null
        columns: [
          { column_id: "name", column_values: [$query] }
        ]
      ) {
        cursor
        items {
          ...ItemBaseFields
          board {
            id
            name
          }
          column_values {
            ...ColumnValueFields
          }
          group {
            ...GroupFields
          }
        }
      }
    }
    ${FRAGMENTS.ITEM_BASE}
    ${FRAGMENTS.COLUMN_VALUE}
    ${FRAGMENTS.GROUP}
  `,

  /**
   * Get users.
   */
  USERS: `
    query Users($ids: [ID!], $limit: Int) {
      users(ids: $ids, limit: $limit) {
        ...UserFields
        teams {
          id
          name
        }
      }
    }
    ${FRAGMENTS.USER}
  `,

  /**
   * Get tags.
   */
  TAGS: `
    query Tags($ids: [ID!]) {
      tags(ids: $ids) {
        id
        name
        color
      }
    }
  `,

  /**
   * Get complexity budget.
   */
  COMPLEXITY: `
    query Complexity {
      complexity {
        before
        after
        reset_in_x_seconds
      }
    }
  `,
};

/**
 * Mutations for Monday.com GraphQL API.
 */
export const MUTATIONS = {
  /**
   * Create a new item.
   */
  CREATE_ITEM: `
    mutation CreateItem($board_id: ID!, $item_name: String!, $group_id: String, $column_values: JSON) {
      create_item(
        board_id: $board_id
        item_name: $item_name
        group_id: $group_id
        column_values: $column_values
      ) {
        ...ItemBaseFields
        column_values {
          ...ColumnValueFields
        }
        group {
          ...GroupFields
        }
      }
    }
    ${FRAGMENTS.ITEM_BASE}
    ${FRAGMENTS.COLUMN_VALUE}
    ${FRAGMENTS.GROUP}
  `,

  /**
   * Create a subitem.
   */
  CREATE_SUBITEM: `
    mutation CreateSubitem($parent_item_id: ID!, $item_name: String!, $column_values: JSON) {
      create_subitem(
        parent_item_id: $parent_item_id
        item_name: $item_name
        column_values: $column_values
      ) {
        ...ItemBaseFields
        column_values {
          ...ColumnValueFields
        }
      }
    }
    ${FRAGMENTS.ITEM_BASE}
    ${FRAGMENTS.COLUMN_VALUE}
  `,

  /**
   * Update an item's name.
   */
  UPDATE_ITEM_NAME: `
    mutation UpdateItemName($board_id: ID!, $item_id: ID!, $value: String!) {
      change_simple_column_value(
        board_id: $board_id
        item_id: $item_id
        column_id: "name"
        value: $value
      ) {
        ...ItemBaseFields
      }
    }
    ${FRAGMENTS.ITEM_BASE}
  `,

  /**
   * Update column values.
   */
  UPDATE_COLUMN_VALUES: `
    mutation UpdateColumnValues($board_id: ID!, $item_id: ID!, $column_values: JSON!) {
      change_multiple_column_values(
        board_id: $board_id
        item_id: $item_id
        column_values: $column_values
      ) {
        ...ItemBaseFields
        column_values {
          ...ColumnValueFields
        }
      }
    }
    ${FRAGMENTS.ITEM_BASE}
    ${FRAGMENTS.COLUMN_VALUE}
  `,

  /**
   * Update a single column value.
   */
  UPDATE_COLUMN_VALUE: `
    mutation UpdateColumnValue($board_id: ID!, $item_id: ID!, $column_id: String!, $value: JSON!) {
      change_column_value(
        board_id: $board_id
        item_id: $item_id
        column_id: $column_id
        value: $value
      ) {
        ...ItemBaseFields
        column_values {
          ...ColumnValueFields
        }
      }
    }
    ${FRAGMENTS.ITEM_BASE}
    ${FRAGMENTS.COLUMN_VALUE}
  `,

  /**
   * Move item to a different group.
   */
  MOVE_ITEM_TO_GROUP: `
    mutation MoveItemToGroup($item_id: ID!, $group_id: String!) {
      move_item_to_group(item_id: $item_id, group_id: $group_id) {
        ...ItemBaseFields
        group {
          ...GroupFields
        }
      }
    }
    ${FRAGMENTS.ITEM_BASE}
    ${FRAGMENTS.GROUP}
  `,

  /**
   * Move item to a different board.
   */
  MOVE_ITEM_TO_BOARD: `
    mutation MoveItemToBoard($item_id: ID!, $board_id: ID!, $group_id: String) {
      move_item_to_board(item_id: $item_id, board_id: $board_id, group_id: $group_id) {
        ...ItemBaseFields
      }
    }
    ${FRAGMENTS.ITEM_BASE}
  `,

  /**
   * Archive an item.
   */
  ARCHIVE_ITEM: `
    mutation ArchiveItem($item_id: ID!) {
      archive_item(item_id: $item_id) {
        ...ItemBaseFields
      }
    }
    ${FRAGMENTS.ITEM_BASE}
  `,

  /**
   * Delete an item.
   */
  DELETE_ITEM: `
    mutation DeleteItem($item_id: ID!) {
      delete_item(item_id: $item_id) {
        id
      }
    }
  `,

  /**
   * Create an update (comment).
   */
  CREATE_UPDATE: `
    mutation CreateUpdate($item_id: ID!, $body: String!) {
      create_update(item_id: $item_id, body: $body) {
        id
        body
        text_body
        created_at
        creator {
          ...UserFields
        }
      }
    }
    ${FRAGMENTS.USER}
  `,

  /**
   * Delete an update.
   */
  DELETE_UPDATE: `
    mutation DeleteUpdate($id: ID!) {
      delete_update(id: $id) {
        id
      }
    }
  `,

  /**
   * Add subscribers to an item.
   */
  ADD_SUBSCRIBERS: `
    mutation AddSubscribers($item_id: ID!, $user_ids: [ID!]!) {
      change_multiple_column_values(
        item_id: $item_id
        board_id: $board_id
        column_values: $column_values
      ) {
        id
      }
    }
  `,

  /**
   * Create a board.
   */
  CREATE_BOARD: `
    mutation CreateBoard($board_name: String!, $board_kind: BoardKind!, $workspace_id: ID, $template_id: ID) {
      create_board(
        board_name: $board_name
        board_kind: $board_kind
        workspace_id: $workspace_id
        template_id: $template_id
      ) {
        ...BoardBaseFields
      }
    }
    ${FRAGMENTS.BOARD_BASE}
  `,

  /**
   * Create a group.
   */
  CREATE_GROUP: `
    mutation CreateGroup($board_id: ID!, $group_name: String!, $position: String) {
      create_group(board_id: $board_id, group_name: $group_name, position: $position) {
        ...GroupFields
      }
    }
    ${FRAGMENTS.GROUP}
  `,

  /**
   * Duplicate a group.
   */
  DUPLICATE_GROUP: `
    mutation DuplicateGroup($board_id: ID!, $group_id: String!) {
      duplicate_group(board_id: $board_id, group_id: $group_id) {
        ...GroupFields
      }
    }
    ${FRAGMENTS.GROUP}
  `,

  /**
   * Archive a group.
   */
  ARCHIVE_GROUP: `
    mutation ArchiveGroup($board_id: ID!, $group_id: String!) {
      archive_group(board_id: $board_id, group_id: $group_id) {
        ...GroupFields
      }
    }
    ${FRAGMENTS.GROUP}
  `,

  /**
   * Delete a group.
   */
  DELETE_GROUP: `
    mutation DeleteGroup($board_id: ID!, $group_id: String!) {
      delete_group(board_id: $board_id, group_id: $group_id) {
        ...GroupFields
      }
    }
    ${FRAGMENTS.GROUP}
  `,
};
