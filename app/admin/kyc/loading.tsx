import { Skeleton } from "@/components/ui/skeleton"

export default function KycLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-5 w-96" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <Skeleton className="h-10 w-full max-w-lg" />
          <div className="flex items-center space-x-3">
            <Skeleton className="h-10 w-[180px]" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <Skeleton className="h-4 w-24" />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <Skeleton className="h-4 w-16" />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <Skeleton className="h-4 w-32" />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <Skeleton className="h-4 w-20" />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <Skeleton className="h-4 w-28" />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <Skeleton className="h-4 w-20" />
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Array.from({ length: 7 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Skeleton className="h-4 w-28" />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Skeleton className="h-4 w-12" />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Skeleton className="h-4 w-40" />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Skeleton className="h-4 w-20" />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Skeleton className="h-4 w-24" />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex space-x-2">
                      <Skeleton className="h-8 w-8" />
                      <Skeleton className="h-8 w-8" />
                      <Skeleton className="h-8 w-8" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
