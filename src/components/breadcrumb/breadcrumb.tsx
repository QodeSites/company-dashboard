"use client";

import Link from "next/link";

type Crumb = {
  label: string;
  href?: string; // if no href, it's the current page
};

interface BreadcrumbProps {
  crumbs: Crumb[];
}

const Breadcrumb: React.FC<BreadcrumbProps> = ({ crumbs }) => {
  return (
    <div>
      <nav>
        <ol className="flex flex-wrap items-center gap-1.5">
          {crumbs.map((crumb, index) => (
            <li key={index} className="flex items-center gap-1.5">
              {index !== 0 && (
                <span className="text-gray-500 dark:text-gray-400">
                  <span> / </span>
                </span>
              )}

              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-brand-500 dark:text-gray-400 dark:hover:text-brand-400"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="flex items-center gap-1 text-sm text-gray-800 dark:text-white/90">
                  {crumb.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
};

export default Breadcrumb;
