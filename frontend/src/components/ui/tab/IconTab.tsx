import React, { useState } from 'react';

interface TabItem {
  name: string;
  content: React.ReactNode;
  icon?: React.ReactNode;
}

interface IconTabProps {
  className?: string;
  defaultTab?: string;
  tabs: TabItem[];
}

const IconTab: React.FC<IconTabProps> = ({ className = '', defaultTab, tabs }) => {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.name || '');

  if (!tabs.length) {
    return <div>No tabs provided</div>;
  }

  return (
    <div className={`rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] ${className}`}>
      <div className="px-6 py-5">
        <h3 className="text-base font-medium text-gray-800 dark:text-white/90">Tab with line and icon</h3>
      </div>
      <div className="p-4 border-t border-gray-100 dark:border-gray-800 sm:p-6">
        <div className="space-y-6">
          <div className="p-6 border border-gray-200 rounded-xl dark:border-gray-800">
            <div className="border-b border-gray-200 dark:border-gray-800">
              <nav className="flex space-x-2 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-600">
                {tabs.map((tab) => (
                  <button
                    key={tab.name}
                    onClick={() => setActiveTab(tab.name)}
                    className={`inline-flex items-center gap-2 border-b-2 px-2.5 py-2 text-sm font-medium transition-colors duration-200 ${
                      activeTab === tab.name
                        ? 'text-brand-500 border-brand-500 dark:text-brand-400 dark:border-brand-400'
                        : 'text-gray-500 border-transparent hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                  >
                    {tab.icon}
                    {tab.name}
                  </button>
                ))}
              </nav>
            </div>
            <div className="pt-4">
              {tabs.find((tab) => tab.name === activeTab)?.content || <p>No content available</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IconTab;