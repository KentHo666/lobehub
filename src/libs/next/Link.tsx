/**
 * Link adapter — maps Next.js Link API (href prop) to react-router-dom Link (to prop).
 * External URLs (http/https) are rendered as plain <a> tags.
 */

import { type AnchorHTMLAttributes, forwardRef } from 'react';
import { Link as RRLink } from 'react-router-dom';

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string;
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
}

const Link = forwardRef<HTMLAnchorElement, LinkProps>(
  ({ href, replace, prefetch, scroll, children, ...rest }, ref) => {
    // External links → plain <a>
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
      return (
        <a ref={ref} href={href} {...rest}>
          {children}
        </a>
      );
    }

    return (
      <RRLink ref={ref} replace={replace} to={href} {...rest}>
        {children}
      </RRLink>
    );
  },
);

Link.displayName = 'Link';

export default Link;
