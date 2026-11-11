import {redirect} from "next/navigation";
import {getStudioPermission} from "@/auth";
import {VideoProducerScheduleCalendar} from "@/video-producer-schedule-calendar";
import "./calendar.css";
export default async function VideoProducerCalendarPage(){
 const {access,allowed}=await getStudioPermission("manage_distribution");
 if(!allowed||access.state!=="allowed")redirect("/admin");
 return <VideoProducerScheduleCalendar/>;
}
