// The Kerasi components the app uses. Button, IconButton and Input pass
// any other props on to their <button> or <input>; their declarations
// leave that out, so the types are widened here, in one place.

import type {
  ButtonHTMLAttributes,
  ComponentType,
  InputHTMLAttributes,
} from 'react';
import * as button from '@kerasi/components/core/Button.jsx';
import type { ButtonProps } from '@kerasi/components/core/Button.jsx';
import * as iconButton from '@kerasi/components/core/IconButton.jsx';
import type { IconButtonProps } from '@kerasi/components/core/IconButton.jsx';
import * as input from '@kerasi/components/forms/Input.jsx';
import type { InputProps } from '@kerasi/components/forms/Input.jsx';

type Rest<Element> = Omit<ButtonHTMLAttributes<Element>, 'type' | 'style'>;

export const Button = button.Button as ComponentType<
  ButtonProps & Rest<HTMLButtonElement>
>;

export const IconButton = iconButton.IconButton as ComponentType<
  IconButtonProps & Rest<HTMLButtonElement>
>;

export const Input = input.Input as ComponentType<
  InputProps &
    Omit<InputHTMLAttributes<HTMLInputElement>, keyof InputProps | 'style'>
>;

export { Badge } from '@kerasi/components/core/Badge.jsx';
export { Dialog } from '@kerasi/components/feedback/Dialog.jsx';
export { Tooltip } from '@kerasi/components/feedback/Tooltip.jsx';
export { Select } from '@kerasi/components/forms/Select.jsx';
export { Tabs } from '@kerasi/components/navigation/Tabs.jsx';

/** Kerasi buttons are 32–42 px tall; touch targets need 44 */
export const TOUCH = { height: 44 } as const;
