/// <reference types="react" />

declare namespace React {
  export type ReactNode = import('react').ReactNode;
}

export type TextProps = {
  children: React.ReactNode;
  style?: object;
  numberOfLines?: number;
  allowFontScaling?: boolean;
  selectable?: boolean;
};