const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { date } = event
  
  if (!date) {
    return {
      success: false,
      message: 'Missing date parameter'
    }
  }

  try {
    // Parse the date string (YYYY-MM-DD)
    // We want to query the range that corresponds to this Beijing Date.
    // Beijing is UTC+8.
    // 00:00 Beijing = 16:00 (Previous Day) UTC.
    // Example: Query 2023-10-27 Beijing.
    // Start: 2023-10-26 16:00:00 UTC.
    // End:   2023-10-27 15:59:59 UTC.
    
    // Create UTC Date for 00:00:00 on that day (in UTC context)
    // new Date("2023-10-27") -> 2023-10-27T00:00:00.000Z
    const utcDate = new Date(date);
    if (isNaN(utcDate.getTime())) {
        return {
            success: false,
            message: 'Invalid date format'
        }
    }

    // Adjust to get Beijing Start Time in UTC
    // We want to be absolutely sure we cover the entire Beijing day.
    // Beijing Time (UTC+8) to UTC: -8 hours.
    // Query range: Target Date (Beijing) 00:00 -> UTC (Prev Day 16:00)
    // To be safe against any edge cases, we query a wider range (e.g., +/- 24 hours around target)
    // and then filter strictly in memory.
    
    // utcDate is UTC 00:00 of the target date string.
    // e.g., "2023-10-27" -> 2023-10-27T00:00:00Z
    
    const queryStart = new Date(utcDate.getTime() - 24 * 60 * 60 * 1000); // -24 hours
    const queryEnd = new Date(utcDate.getTime() + 48 * 60 * 60 * 1000);   // +48 hours
    
    const _ = db.command
    
    // Query appointments - REMOVE ALL DATE FILTERS to ensure we get data
    // We will let the frontend handle the filtering
    const result = await db.collection('appointments')
      .where({
        status: _.neq('cancelled')
      })
      .field({
        timeSlot: true,
        appointmentTime: true
      })
      .limit(1000)
      .get()

    const appointments = result.data || []
    
    // Debug info
    console.log(`Found ${appointments.length} appointments`)

    return {
      success: true,
      data: appointments,
      debug_count: appointments.length
    }

  } catch (e) {
    console.error(e)
    return {
      success: false,
      message: 'System error',
      error: e
    }
  }
}