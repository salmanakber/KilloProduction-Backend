export function calculateRating(ratingArray: number[]) {
  if (ratingArray.length === 0) {
    return {
      averageRating: 0,
      roundedRating: 0,
      totalReviews: 0,
    }
  }
  const averageRating = ratingArray.reduce((sum, rating) => sum + rating, 0) / ratingArray.length
  const roundedRating = Math.round(averageRating * 10) / 10
  const totalReviews = ratingArray.length
  return {
    averageRating: averageRating,
    roundedRating: roundedRating,
    totalReviews: totalReviews,
  }
}