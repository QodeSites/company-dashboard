import React, { useState } from 'react';

interface TabItem {
  name: string;
  content: React.ReactNode;
}

interface VerticalTabProps {
  className?: string;
  defaultTab?: string;
  tabs: TabItem[];
}

const VerticalTab: React.FC<VerticalTabProps> = ({ className = '', defaultTab, tabs }) => {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.name || '');

  if (!tabs.length) {
    return <div>No tabs provided</div>;
  }

  return (
    <div className={`rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] ${className}`}>
      <div className="px-6 py-5">
        <h3 className="text-base font-medium text-gray-800 dark:text-white/90">Vertical Tab</h3>
      </div>
      <div className="p-4 border-t border-gray-100 dark:border-gray-800 sm:p-6">
        <div className="space-y-6">
          <div className="p-6 border border-gray-200 rounded-xl dark:border-gray-800">
            <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
              <div className="overflow-x-auto pb-2 sm:w-[200px] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-100 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-track]:bg-white dark:[&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:h-1.5">
                <nav className="flex flex-row w-full sm:flex-col sm:space-y-2">
                  {tabs.map((tab) => (
                    <button
                      key={tab.name}
                      onClick={() => setActiveTab(tab.name)}
                      className={`inline-flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200 ease-in-out sm:p-3 ${
                        activeTab === tab.name
                          ? 'text-brand-500 dark:bg-brand-400/20 dark:text-brand-400 bg-brand-50'
                          : 'bg-transparent text-gray-500 border-transparent hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                      }`}
                    >
                      {tab.name}
                    </button>
                  ))}
                </nav>
              </div>
              <div className="flex-1">
                {tabs.find((tab) => tab.name === activeTab)?.content || <p>No content available</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerticalTab;