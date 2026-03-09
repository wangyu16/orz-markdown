declare module 'markdown-it-imsize' {
  import type { PluginSimple } from 'markdown-it';
  const imsizePlugin: PluginSimple;
  export default imsizePlugin;
}

declare module 'markdown-it-mark' {
  import type { PluginSimple } from 'markdown-it';
  const markPlugin: PluginSimple;
  export default markPlugin;
}

declare module 'markdown-it-sub' {
  import type { PluginSimple } from 'markdown-it';
  const subPlugin: PluginSimple;
  export default subPlugin;
}

declare module 'markdown-it-sup' {
  import type { PluginSimple } from 'markdown-it';
  const supPlugin: PluginSimple;
  export default supPlugin;
}

declare module 'markdown-it-ins' {
  import type { PluginSimple } from 'markdown-it';
  const insPlugin: PluginSimple;
  export default insPlugin;
}

declare module 'markdown-it-task-lists' {
  import type { PluginWithOptions } from 'markdown-it';
  interface TaskListsOptions {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }
  const taskListsPlugin: PluginWithOptions<TaskListsOptions>;
  export default taskListsPlugin;
}
